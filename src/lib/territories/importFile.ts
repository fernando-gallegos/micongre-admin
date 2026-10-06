// Solo cliente. Lee un archivo de mapa común (KML, KMZ o GeoJSON) y lo convierte
// a los elementos que sabe dibujar el editor: polígonos, líneas y puntos.
import { strFromU8, unzipSync } from "fflate";
import { MAX_FEATURES, type LngLat, type TerritoryFeature, type TerritoryGeometry, type TerritoryKind } from "./geo";

export interface ImportResult {
	features: TerritoryFeature[];
	/** Elementos que no se pudieron importar (tipo no admitido, vacíos, de más). */
	skipped: number;
}

export class ImportError extends Error {}

const MAX_VERTICES = 2000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function validPosition(p: unknown): LngLat | null {
	if (!Array.isArray(p) || p.length < 2) return null;
	const lng = Number(p[0]);
	const lat = Number(p[1]);
	if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
	return [round6(lng), round6(lat)];
}

/** Quita posiciones inválidas y, si hay demasiadas, deja una muestra pareja. */
function cleanPositions(raw: unknown): LngLat[] {
	const list = (Array.isArray(raw) ? raw : []).map(validPosition).filter((p): p is LngLat => !!p);
	if (list.length <= MAX_VERTICES) return list;
	const step = (list.length - 1) / (MAX_VERTICES - 1);
	return Array.from({ length: MAX_VERTICES }, (_, i) => list[Math.round(i * step)] as LngLat);
}

function ring(raw: unknown): LngLat[] | null {
	const pts = cleanPositions(raw);
	const first = pts[0];
	const last = pts[pts.length - 1];
	if (!first || !last) return null;
	const closed = first[0] === last[0] && first[1] === last[1] ? pts : [...pts, first];
	return closed.length >= 4 ? closed : null;
}

type Pushed = (geometry: TerritoryGeometry | null) => void;

/** Recorre una geometría GeoJSON (con sus variantes Multi*) y entrega las figuras simples. */
function walkGeoJsonGeometry(g: unknown, push: Pushed): void {
	if (!g || typeof g !== "object") return push(null);
	const geo = g as { type?: string; coordinates?: unknown; geometries?: unknown[] };
	switch (geo.type) {
		case "Point": {
			const p = validPosition(geo.coordinates);
			return push(p ? { type: "Point", coordinates: p } : null);
		}
		case "MultiPoint":
			for (const c of (geo.coordinates as unknown[]) ?? []) {
				const p = validPosition(c);
				push(p ? { type: "Point", coordinates: p } : null);
			}
			return;
		case "LineString": {
			const pts = cleanPositions(geo.coordinates);
			return push(pts.length >= 2 ? { type: "LineString", coordinates: pts } : null);
		}
		case "MultiLineString":
			for (const c of (geo.coordinates as unknown[]) ?? []) {
				const pts = cleanPositions(c);
				push(pts.length >= 2 ? { type: "LineString", coordinates: pts } : null);
			}
			return;
		case "Polygon": {
			// Solo el contorno exterior (los huecos no se dibujan).
			const r = ring(((geo.coordinates as unknown[]) ?? [])[0]);
			return push(r ? { type: "Polygon", coordinates: [r] } : null);
		}
		case "MultiPolygon":
			for (const poly of (geo.coordinates as unknown[]) ?? []) {
				const r = ring(((poly as unknown[]) ?? [])[0]);
				push(r ? { type: "Polygon", coordinates: [r] } : null);
			}
			return;
		case "GeometryCollection":
			for (const sub of geo.geometries ?? []) walkGeoJsonGeometry(sub, push);
			return;
		default:
			return push(null);
	}
}

function fromGeoJson(text: string, push: Pushed) {
	let doc: { type?: string; features?: { geometry?: unknown }[]; geometry?: unknown };
	try {
		doc = JSON.parse(text);
	} catch {
		throw new ImportError("El archivo no es un GeoJSON válido.");
	}
	if (doc.type === "FeatureCollection" && Array.isArray(doc.features)) {
		for (const f of doc.features) walkGeoJsonGeometry(f?.geometry, push);
	} else if (doc.type === "Feature") {
		walkGeoJsonGeometry(doc.geometry, push);
	} else {
		walkGeoJsonGeometry(doc, push);
	}
}

/** KML escribe "lng,lat[,alt]" separado por espacios o saltos de línea. */
function kmlCoordinates(el: Element | undefined): unknown[] {
	const text = el?.textContent ?? "";
	return text
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((tuple) => tuple.split(",").map(Number));
}

function fromKml(text: string, push: Pushed) {
	const xml = new DOMParser().parseFromString(text, "text/xml");
	if (xml.getElementsByTagName("parsererror").length > 0) throw new ImportError("El archivo no es un KML válido.");

	const placemarks = Array.from(xml.getElementsByTagName("Placemark"));
	if (placemarks.length === 0) throw new ImportError("El archivo no tiene lugares marcados (Placemark).");

	for (const pm of placemarks) {
		let any = false;
		for (const el of Array.from(pm.getElementsByTagName("Point"))) {
			any = true;
			const p = validPosition(kmlCoordinates(el.getElementsByTagName("coordinates")[0])[0]);
			push(p ? { type: "Point", coordinates: p } : null);
		}
		for (const el of Array.from(pm.getElementsByTagName("LineString"))) {
			any = true;
			const pts = cleanPositions(kmlCoordinates(el.getElementsByTagName("coordinates")[0]));
			push(pts.length >= 2 ? { type: "LineString", coordinates: pts } : null);
		}
		for (const el of Array.from(pm.getElementsByTagName("Polygon"))) {
			any = true;
			const outer = el.getElementsByTagName("outerBoundaryIs")[0];
			const r = ring(kmlCoordinates(outer?.getElementsByTagName("coordinates")[0]));
			push(r ? { type: "Polygon", coordinates: [r] } : null);
		}
		if (!any) push(null);
	}
}

async function readKmz(file: File): Promise<string> {
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
	} catch {
		throw new ImportError("El archivo KMZ está dañado.");
	}
	const names = Object.keys(entries).filter((n) => n.toLowerCase().endsWith(".kml"));
	const name = names.find((n) => n.toLowerCase() === "doc.kml") ?? names[0];
	if (!name) throw new ImportError("El KMZ no contiene ningún KML.");
	return strFromU8(entries[name] as Uint8Array);
}

/** Convierte un archivo KML, KMZ o GeoJSON en elementos del editor. Un territorio
 * de predicación pública solo admite puntos: lo demás se omite. */
export async function parseMapFile(file: File, kind: TerritoryKind, room = MAX_FEATURES): Promise<ImportResult> {
	const lower = file.name.toLowerCase();
	const features: TerritoryFeature[] = [];
	let skipped = 0;
	const push: Pushed = (geometry) => {
		if (!geometry || (kind === "public_preaching" && geometry.type !== "Point") || features.length >= room) {
			skipped++;
			return;
		}
		features.push({ type: "Feature", geometry, properties: { fid: crypto.randomUUID() } });
	};

	if (lower.endsWith(".kmz")) fromKml(await readKmz(file), push);
	else if (lower.endsWith(".kml")) fromKml(await file.text(), push);
	else if (lower.endsWith(".geojson") || lower.endsWith(".json")) fromGeoJson(await file.text(), push);
	else throw new ImportError("Usa un archivo KML, KMZ o GeoJSON.");

	return { features, skipped };
}
