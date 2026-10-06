// Solo cliente. Controlador del mapa de un territorio sobre MapLibre GL: muestra
// el dibujo guardado y, si es editable, permite dibujar y editar polígonos,
// líneas, puntos (con emoji) y textos. Los polígonos y líneas son capas de
// MapLibre; los puntos y textos son marcadores HTML (así se ven los emojis a
// color y cualquier carácter, sin depender de fuentes del mapa).
import type * as GeoJSON from "geojson";
import type {
	FilterSpecification,
	GeoJSONSource,
	Map as MlMap,
	MapLayerMouseEvent,
	MapLayerTouchEvent,
	MapMouseEvent,
	Marker,
} from "maplibre-gl";
import {
	ALLOWED_TOOLS,
	boundsOf,
	DEFAULT_POINT_EMOJI,
	MAX_FEATURES,
	type DrawTool,
	type LngLat,
	type TerritoryFeature,
	type TerritoryKind,
	type TerritoryMapData,
} from "./geo";
import { getBaseMapStyle } from "./mapStyle";

type MapLib = typeof import("maplibre-gl");

export type EditorTool = "select" | DrawTool;
export type ShapeType = "polygon" | "line" | "point" | "text";

export interface EditorState {
	tool: EditorTool;
	selected: { id: string; type: ShapeType; text?: string; emoji?: string } | null;
	/** Vértices ya puestos del polígono/línea que se está dibujando. */
	drafting: number;
	canUndo: boolean;
	count: number;
	/** Emoji con el que se colocan los puntos nuevos (null = punto simple). */
	placingEmoji: string | null;
}

export interface TextRequest {
	/** Id del texto que se edita; null = texto nuevo. */
	id: string | null;
	lngLat: LngLat;
	value: string;
}

export interface ControllerOptions {
	kind: TerritoryKind;
	editable: boolean;
	data: TerritoryMapData | null;
	/** Centro inicial si todavía no hay nada dibujado. */
	initialCenter?: LngLat;
	onChange?: (data: TerritoryMapData) => void;
	onState?: (state: EditorState) => void;
	onTextRequest?: (request: TextRequest) => void;
}

const SHAPES = "td-shapes";
const DRAFT = "td-draft";
const HANDLES = "td-handles";
const POLYGON_COLOR = "#e11d48";
const LINE_COLOR = "#2563eb";
const MIN_VERTICES = { polygon: 3, line: 2 } as const;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const toLngLat = (e: { lngLat: { lng: number; lat: number } }): LngLat => [round6(e.lngLat.lng), round6(e.lngLat.lat)];

function shapeTypeOf(f: TerritoryFeature): ShapeType {
	if (f.geometry.type === "Polygon") return "polygon";
	if (f.geometry.type === "LineString") return "line";
	return f.properties.kind === "text" ? "text" : "point";
}

function getVertices(f: TerritoryFeature): LngLat[] {
	if (f.geometry.type === "Polygon") return (f.geometry.coordinates[0] ?? []).slice(0, -1);
	if (f.geometry.type === "LineString") return f.geometry.coordinates;
	return [f.geometry.coordinates];
}

function setVertices(f: TerritoryFeature, vertices: LngLat[]) {
	if (f.geometry.type === "Polygon") f.geometry.coordinates = [[...vertices, vertices[0] as LngLat]];
	else if (f.geometry.type === "LineString") f.geometry.coordinates = vertices;
	else f.geometry.coordinates = vertices[0] as LngLat;
}

export class TerritoryMapController {
	private features: TerritoryFeature[];
	private tool: EditorTool = "select";
	private selectedId: string | null = null;
	private draft: LngLat[] = [];
	private cursor: LngLat | null = null;
	private history: string[] = [];
	private markers: Marker[] = [];
	private placingEmoji: string | null = DEFAULT_POINT_EMOJI;
	private drag: { id: string; index: number; type: "v" | "m"; moved: boolean } | null = null;
	private lastDragEnd = 0;
	private destroyed = false;

	private constructor(
		private readonly lib: MapLib,
		private readonly map: MlMap,
		private readonly opts: ControllerOptions,
	) {
		this.features = JSON.parse(JSON.stringify(opts.data?.features ?? [])) as TerritoryFeature[];
	}

	/** Crea el mapa y espera a que cargue su estilo. */
	static async create(container: HTMLElement, opts: ControllerOptions): Promise<TerritoryMapController> {
		const [lib, style] = await Promise.all([import("maplibre-gl"), getBaseMapStyle()]);
		const bounds = boundsOf(opts.data);
		const map = new lib.Map({
			container,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			style: style as any,
			center: opts.initialCenter ?? [0, 20],
			zoom: opts.initialCenter ? 14 : 1.5,
			attributionControl: { compact: true },
			doubleClickZoom: !opts.editable,
			dragRotate: false,
			pitchWithRotate: false,
		});
		map.touchZoomRotate.disableRotation();
		map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");

		const controller = new TerritoryMapController(lib, map, opts);
		// "style.load" (no "load"): no espera al primer cuadro dibujado, así que
		// también resuelve con la pestaña en segundo plano.
		await new Promise<void>((resolve, reject) => {
			// getStyle() solo devuelve algo cuando el estilo ya cargó (puede haberlo
			// hecho antes de registrar el evento).
			if (map.getStyle()) return resolve();
			map.once("style.load", () => resolve());
			map.once("error", (e) => reject(e.error));
		});
		controller.init();
		if (bounds) controller.fitAll(false);
		return controller;
	}

	// --- Inicialización -----------------------------------------------------

	private init() {
		const map = this.map;
		const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

		map.addSource(SHAPES, { type: "geojson", data: EMPTY });
		map.addSource(DRAFT, { type: "geojson", data: EMPTY });
		map.addSource(HANDLES, { type: "geojson", data: EMPTY });

		const notPoint: FilterSpecification = ["!=", ["geometry-type"], "Point"];
		// Debajo de los nombres de calles, para que se sigan leyendo.
		map.addLayer(
			{
				id: "td-sel",
				type: "line",
				source: SHAPES,
				filter: ["all", ["==", ["get", "sel"], true], notPoint],
				layout: { "line-cap": "round", "line-join": "round" },
				paint: { "line-color": "#facc15", "line-width": 10, "line-opacity": 0.7 },
			},
			firstSymbol,
		);
		map.addLayer(
			{
				id: "td-fill",
				type: "fill",
				source: SHAPES,
				filter: ["==", ["geometry-type"], "Polygon"],
				paint: { "fill-color": POLYGON_COLOR, "fill-opacity": 0.18 },
			},
			firstSymbol,
		);
		map.addLayer(
			{
				id: "td-poly-line",
				type: "line",
				source: SHAPES,
				filter: ["==", ["geometry-type"], "Polygon"],
				layout: { "line-join": "round" },
				paint: { "line-color": POLYGON_COLOR, "line-width": 3 },
			},
			firstSymbol,
		);
		map.addLayer(
			{
				id: "td-line",
				type: "line",
				source: SHAPES,
				filter: ["==", ["geometry-type"], "LineString"],
				layout: { "line-cap": "round", "line-join": "round" },
				paint: { "line-color": LINE_COLOR, "line-width": 4 },
			},
			firstSymbol,
		);

		map.addLayer({
			id: "td-draft-fill",
			type: "fill",
			source: DRAFT,
			filter: ["==", ["geometry-type"], "Polygon"],
			paint: { "fill-color": POLYGON_COLOR, "fill-opacity": 0.15 },
		});
		map.addLayer({
			id: "td-draft-line",
			type: "line",
			source: DRAFT,
			filter: ["==", ["geometry-type"], "LineString"],
			layout: { "line-cap": "round", "line-join": "round" },
			paint: { "line-color": "#111827", "line-width": 3, "line-dasharray": [2, 1.5] },
		});
		map.addLayer({
			id: "td-draft-pt",
			type: "circle",
			source: DRAFT,
			filter: ["==", ["geometry-type"], "Point"],
			paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 2 },
		});
		map.addLayer({
			id: "td-h-mid",
			type: "circle",
			source: HANDLES,
			filter: ["==", ["get", "h"], "m"],
			paint: {
				"circle-radius": 5,
				"circle-color": "#ffffff",
				"circle-opacity": 0.75,
				"circle-stroke-color": "#111827",
				"circle-stroke-width": 1.5,
				"circle-stroke-opacity": 0.6,
			},
		});
		map.addLayer({
			id: "td-h-v",
			type: "circle",
			source: HANDLES,
			filter: ["==", ["get", "h"], "v"],
			paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 2.5 },
		});

		if (this.opts.editable) this.bindEditing();
		this.refresh();
	}

	private bindEditing() {
		const map = this.map;
		map.on("click", this.onClick);
		map.on("mousemove", this.onMove);
		map.on("mousedown", "td-h-v", (e) => this.startDrag(e, "v"));
		map.on("mousedown", "td-h-mid", (e) => this.startDrag(e, "m"));
		map.on("touchstart", "td-h-v", (e) => this.startDrag(e, "v"));
		map.on("touchstart", "td-h-mid", (e) => this.startDrag(e, "m"));
		map.on("mousemove", this.onDragMove);
		map.on("touchmove", this.onDragMove);
		map.on("mouseup", this.endDrag);
		map.on("touchend", this.endDrag);
		map.on("dblclick", this.onDblClick);
		map.on("dblclick", "td-h-v", this.onVertexDblClick);
		for (const layer of ["td-h-v", "td-h-mid"]) {
			map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "grab"));
			map.on("mouseleave", layer, () => this.updateCursor());
		}
		document.addEventListener("keydown", this.onKeyDown);
	}

	// --- Acciones públicas --------------------------------------------------

	setTool(tool: EditorTool) {
		if (tool !== "select" && !ALLOWED_TOOLS[this.opts.kind].includes(tool)) return;
		this.draft = [];
		this.cursor = null;
		this.tool = tool;
		if (tool !== "select") this.selectedId = null;
		this.refresh();
	}

	chooseEmoji(emoji: string | null) {
		this.placingEmoji = emoji;
		const selected = this.selected();
		if (selected && shapeTypeOf(selected) === "point") {
			this.pushHistory();
			if (emoji) selected.properties.emoji = emoji;
			else delete selected.properties.emoji;
			this.changed();
		} else {
			this.emitState();
		}
	}

	finishDraft() {
		const type = this.tool === "polygon" ? "polygon" : this.tool === "line" ? "line" : null;
		if (!type) return;
		if (this.draft.length < MIN_VERTICES[type]) {
			this.cancelDraft();
			return;
		}
		this.pushHistory();
		const fid = crypto.randomUUID();
		this.features.push({
			type: "Feature",
			properties: { fid },
			geometry:
				type === "polygon"
					? { type: "Polygon", coordinates: [[...this.draft, this.draft[0] as LngLat]] }
					: { type: "LineString", coordinates: [...this.draft] },
		});
		this.draft = [];
		this.cursor = null;
		this.tool = "select";
		this.selectedId = fid;
		this.changed();
	}

	cancelDraft() {
		this.draft = [];
		this.cursor = null;
		this.refresh();
	}

	deleteSelected() {
		if (!this.selectedId) return;
		this.pushHistory();
		this.features = this.features.filter((f) => f.properties.fid !== this.selectedId);
		this.selectedId = null;
		this.changed();
	}

	editSelectedText() {
		const f = this.selected();
		if (!f || shapeTypeOf(f) !== "text") return;
		this.opts.onTextRequest?.({ id: f.properties.fid, lngLat: f.geometry.coordinates as LngLat, value: f.properties.text ?? "" });
	}

	/** Respuesta del cuadro de texto: agrega un texto nuevo o cambia uno existente. */
	submitText(request: TextRequest, value: string) {
		const text = value.trim().slice(0, 200);
		if (!text) return;
		this.pushHistory();
		const existing = request.id ? this.features.find((f) => f.properties.fid === request.id) : null;
		if (existing) {
			existing.properties.text = text;
		} else {
			const fid = crypto.randomUUID();
			this.features.push({
				type: "Feature",
				properties: { fid, kind: "text", text },
				geometry: { type: "Point", coordinates: request.lngLat },
			});
		}
		this.changed();
	}

	/** Agrega elementos importados de un archivo y encuadra el resultado. */
	importFeatures(features: TerritoryFeature[]): number {
		const added = features.slice(0, Math.max(0, MAX_FEATURES - this.features.length));
		if (added.length === 0) return 0;
		this.pushHistory();
		this.features.push(...added);
		this.selectedId = null;
		this.tool = "select";
		this.changed();
		this.fitAll();
		return added.length;
	}

	/** Cuántos elementos más caben en este mapa. */
	remainingRoom(): number {
		return Math.max(0, MAX_FEATURES - this.features.length);
	}

	undo() {
		const previous = this.history.pop();
		if (previous === undefined) return;
		this.features = JSON.parse(previous) as TerritoryFeature[];
		if (this.selectedId && !this.selected()) this.selectedId = null;
		this.draft = [];
		this.changed();
	}

	/** Encuadra todo lo dibujado. */
	fitAll(animate = true) {
		const b = boundsOf({ type: "FeatureCollection", features: this.features });
		if (!b) return;
		this.map.fitBounds(
			[
				[b[0], b[1]],
				[b[2], b[3]],
			],
			{ padding: 60, maxZoom: 17, duration: animate ? 600 : 0 },
		);
	}

	/** Centra el mapa en un punto (p. ej. la ubicación del usuario). */
	flyToPoint(lng: number, lat: number, zoom = 16) {
		this.map.flyTo({ center: [lng, lat], zoom, duration: 800 });
	}

	showBox(west: number, south: number, east: number, north: number) {
		this.map.fitBounds(
			[
				[west, south],
				[east, north],
			],
			{ padding: 20, maxZoom: 17, duration: 600 },
		);
	}

	resize() {
		this.map.resize();
	}

	destroy() {
		this.destroyed = true;
		document.removeEventListener("keydown", this.onKeyDown);
		this.clearMarkers();
		this.map.remove();
	}

	// --- Estado -------------------------------------------------------------

	private selected(): TerritoryFeature | null {
		return this.selectedId ? (this.features.find((f) => f.properties.fid === this.selectedId) ?? null) : null;
	}

	private pushHistory() {
		this.history.push(JSON.stringify(this.features));
		if (this.history.length > 50) this.history.shift();
	}

	/** Tras una edición: redibuja y avisa al contenedor del dibujo nuevo. */
	private changed() {
		this.refresh();
		this.opts.onChange?.({ type: "FeatureCollection", features: this.features });
	}

	private select(id: string | null) {
		if (this.selectedId === id) return;
		this.selectedId = id;
		this.refresh();
	}

	private emitState() {
		if (this.destroyed) return;
		const f = this.selected();
		this.opts.onState?.({
			tool: this.tool,
			selected: f
				? { id: f.properties.fid, type: shapeTypeOf(f), text: f.properties.text, emoji: f.properties.emoji }
				: null,
			drafting: this.draft.length,
			canUndo: this.history.length > 0,
			count: this.features.length,
			placingEmoji: this.placingEmoji,
		});
	}

	private refresh() {
		if (this.destroyed) return;
		this.renderShapes();
		this.renderDraft();
		this.renderHandles();
		this.syncMarkers();
		this.updateCursor();
		this.emitState();
	}

	private updateCursor() {
		this.map.getCanvas().style.cursor = this.opts.editable && this.tool !== "select" ? "crosshair" : "";
	}

	// --- Dibujo -------------------------------------------------------------

	private setSource(id: string, data: GeoJSON.FeatureCollection) {
		(this.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
	}

	private renderShapes() {
		this.setSource(SHAPES, {
			type: "FeatureCollection",
			features: this.features
				.filter((f) => f.geometry.type !== "Point")
				.map((f) => ({
					type: "Feature" as const,
					geometry: f.geometry as GeoJSON.Geometry,
					properties: { fid: f.properties.fid, sel: f.properties.fid === this.selectedId },
				})),
		});
	}

	private renderDraft() {
		const features: GeoJSON.Feature[] = [];
		const pts = this.cursor && this.draft.length > 0 ? [...this.draft, this.cursor] : this.draft;
		if (pts.length >= 2) {
			features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
		}
		if (this.tool === "polygon" && pts.length >= 3) {
			features.push({
				type: "Feature",
				properties: {},
				geometry: { type: "Polygon", coordinates: [[...pts, pts[0] as LngLat]] },
			});
		}
		for (const p of this.draft) {
			features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } });
		}
		this.setSource(DRAFT, { type: "FeatureCollection", features });
	}

	private renderHandles() {
		const f = this.selected();
		const features: GeoJSON.Feature[] = [];
		if (this.opts.editable && this.tool === "select" && f && f.geometry.type !== "Point") {
			const v = getVertices(f);
			const closed = f.geometry.type === "Polygon";
			v.forEach((p, i) => {
				features.push({ type: "Feature", properties: { h: "v", i }, geometry: { type: "Point", coordinates: p } });
				const next = v[i + 1] ?? (closed ? v[0] : undefined);
				if (next) {
					features.push({
						type: "Feature",
						properties: { h: "m", i },
						geometry: { type: "Point", coordinates: [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2] },
					});
				}
			});
		}
		this.setSource(HANDLES, { type: "FeatureCollection", features });
	}

	private clearMarkers() {
		for (const m of this.markers) m.remove();
		this.markers = [];
	}

	private syncMarkers() {
		this.clearMarkers();
		const draggable = this.opts.editable && this.tool === "select";
		for (const f of this.features) {
			if (f.geometry.type !== "Point") continue;
			const selected = f.properties.fid === this.selectedId;
			const el = this.buildMarkerElement(f, selected);
			const marker = new this.lib.Marker({ element: el, anchor: "center", draggable })
				.setLngLat(f.geometry.coordinates)
				.addTo(this.map);
			if (this.opts.editable) {
				el.addEventListener("click", () => {
					if (this.tool === "select" && performance.now() - this.lastDragEnd > 300) this.select(f.properties.fid);
				});
				marker.on("dragstart", () => this.select(f.properties.fid));
				marker.on("dragend", () => {
					this.lastDragEnd = performance.now();
					const p = marker.getLngLat();
					this.pushHistory();
					f.geometry = { type: "Point", coordinates: [round6(p.lng), round6(p.lat)] };
					this.changed();
				});
			}
			this.markers.push(marker);
		}
	}

	private buildMarkerElement(f: TerritoryFeature, selected: boolean): HTMLElement {
		const el = document.createElement("div");
		el.className = "td-marker";
		el.style.pointerEvents = this.opts.editable ? "auto" : "none";
		el.style.cursor = this.opts.editable && this.tool === "select" ? "pointer" : "";
		const ring = selected ? "0 0 0 3px #facc15" : "none";

		if (f.properties.kind === "text") {
			el.textContent = f.properties.text ?? "";
			Object.assign(el.style, {
				padding: "1px 4px",
				borderRadius: "4px",
				fontWeight: "700",
				fontSize: "14px",
				lineHeight: "1.2",
				color: "#111827",
				whiteSpace: "nowrap",
				textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff",
				boxShadow: ring,
			});
		} else if (f.properties.emoji) {
			el.textContent = f.properties.emoji;
			Object.assign(el.style, {
				fontSize: "28px",
				lineHeight: "1",
				borderRadius: "8px",
				textShadow: "0 1px 3px rgba(0,0,0,.35)",
				boxShadow: ring,
			});
		} else {
			Object.assign(el.style, {
				width: "16px",
				height: "16px",
				borderRadius: "9999px",
				background: LINE_COLOR,
				border: "3px solid #fff",
				boxShadow: selected ? "0 0 0 3px #facc15" : "0 1px 3px rgba(0,0,0,.5)",
			});
		}
		return el;
	}

	// --- Eventos ------------------------------------------------------------

	private onClick = (e: MapMouseEvent) => {
		if (performance.now() - this.lastDragEnd < 300) return;
		const target = e.originalEvent.target as HTMLElement | null;
		if (target?.closest?.(".td-marker")) return;

		switch (this.tool) {
			case "select": {
				const hits = this.map.queryRenderedFeatures(
					[
						[e.point.x - 6, e.point.y - 6],
						[e.point.x + 6, e.point.y + 6],
					],
					{ layers: ["td-fill", "td-poly-line", "td-line"] },
				);
				this.select((hits[0]?.properties?.fid as string | undefined) ?? null);
				break;
			}
			case "polygon":
			case "line":
				this.addDraftVertex(e);
				break;
			case "point": {
				this.pushHistory();
				const properties: TerritoryFeature["properties"] = { fid: crypto.randomUUID() };
				if (this.placingEmoji) properties.emoji = this.placingEmoji;
				this.features.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: toLngLat(e) } });
				this.changed();
				break;
			}
			case "text":
				this.opts.onTextRequest?.({ id: null, lngLat: toLngLat(e), value: "" });
				break;
		}
	};

	private addDraftVertex(e: MapMouseEvent) {
		const last = this.draft[this.draft.length - 1];
		if (last) {
			const lp = this.map.project(last);
			// Un doble clic llega como dos clics seguidos en el mismo punto.
			if (Math.hypot(lp.x - e.point.x, lp.y - e.point.y) < 4) return;
		}
		const first = this.draft[0];
		if (this.tool === "polygon" && first && this.draft.length >= 3) {
			const fp = this.map.project(first);
			if (Math.hypot(fp.x - e.point.x, fp.y - e.point.y) < 12) {
				this.finishDraft();
				return;
			}
		}
		this.draft.push(toLngLat(e));
		this.refresh();
	}

	private onMove = (e: MapMouseEvent) => {
		if ((this.tool === "polygon" || this.tool === "line") && this.draft.length > 0 && !this.drag) {
			this.cursor = toLngLat(e);
			this.renderDraft();
		}
	};

	private onDblClick = (e: MapMouseEvent) => {
		if (this.tool === "polygon" || this.tool === "line") {
			e.preventDefault();
			this.finishDraft();
		}
	};

	private onVertexDblClick = (e: MapLayerMouseEvent) => {
		e.preventDefault();
		const f = this.selected();
		const index = e.features?.[0]?.properties?.i as number | undefined;
		if (!f || index === undefined) return;
		const v = getVertices(f);
		if (v.length <= (f.geometry.type === "Polygon" ? MIN_VERTICES.polygon : MIN_VERTICES.line)) return;
		this.pushHistory();
		v.splice(index, 1);
		setVertices(f, v);
		this.changed();
	};

	private startDrag(e: MapLayerMouseEvent | MapLayerTouchEvent, type: "v" | "m") {
		if (!this.selectedId || ("points" in e && e.points.length > 1)) return;
		const index = e.features?.[0]?.properties?.i as number | undefined;
		if (index === undefined) return;
		e.preventDefault();
		this.drag = { id: this.selectedId, index, type, moved: false };
		this.map.getCanvas().style.cursor = "grabbing";
	}

	private onDragMove = (e: MapMouseEvent | { lngLat: { lng: number; lat: number } }) => {
		const drag = this.drag;
		if (!drag) return;
		const f = this.features.find((x) => x.properties.fid === drag.id);
		if (!f) return;
		const v = getVertices(f);
		if (!drag.moved) {
			drag.moved = true;
			this.pushHistory();
			if (drag.type === "m") {
				// Arrastrar el punto medio de un lado crea un vértice nuevo ahí.
				const a = v[drag.index] as LngLat;
				const b = (v[drag.index + 1] ?? v[0]) as LngLat;
				v.splice(drag.index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
				drag.index += 1;
				drag.type = "v";
			}
		}
		v[drag.index] = toLngLat(e);
		setVertices(f, v);
		this.renderShapes();
		this.renderHandles();
	};

	private endDrag = () => {
		const drag = this.drag;
		if (!drag) return;
		this.drag = null;
		this.lastDragEnd = performance.now();
		this.updateCursor();
		if (drag.moved) this.changed();
	};

	private onKeyDown = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
		if (e.key === "Enter") this.finishDraft();
		else if (e.key === "Escape") this.cancelDraft();
		else if ((e.key === "Delete" || e.key === "Backspace") && this.tool === "select") this.deleteSelected();
	};
}
