"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import {
	Check,
	Maximize2,
	MapPin,
	MousePointer2,
	Pencil,
	Pentagon,
	Route,
	LocateFixed,
	Search,
	Trash2,
	Type,
	Undo2,
	Upload,
	X,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { Tooltip } from "@/components/ui/Tooltip";
import { MapHeader } from "./MapDialog";
import { ImportError, parseMapFile } from "@/lib/territories/importFile";
import { Spinner } from "@/components/ui/Spinner";
import {
	ALLOWED_TOOLS,
	boundsOf,
	POINT_EMOJIS,
	type DrawTool,
	type TerritoryKind,
	type TerritoryMapData,
} from "@/lib/territories/geo";
import {
	TerritoryMapController,
	type EditorState,
	type EditorTool,
	type TextRequest,
} from "@/lib/territories/mapController";

const TOOL_META: Record<EditorTool, { label: string; icon: LucideIcon; hint: string }> = {
	select: {
		label: "Seleccionar",
		icon: MousePointer2,
		hint: "Toca una figura para seleccionarla; arrastra sus puntos blancos para cambiarla (el punto de en medio de un lado crea uno nuevo). Doble clic en un vértice lo quita.",
	},
	polygon: {
		label: "Polígono",
		icon: Pentagon,
		hint: "Toca el mapa para poner los vértices. Para cerrar: toca el primer vértice, doble clic, Enter o «Terminar».",
	},
	line: { label: "Línea", icon: Route, hint: "Toca el mapa para poner los puntos de la línea. Para terminar: doble clic, Enter o «Terminar»." },
	point: { label: "Punto", icon: MapPin, hint: "Elige un emoji y toca el mapa para colocarlo." },
	text: { label: "Texto", icon: Type, hint: "Toca el mapa donde quieras poner el texto." },
};

const TOOL_ORDER: EditorTool[] = ["select", "polygon", "line", "point", "text"];

const INITIAL_STATE: EditorState = {
	tool: "select",
	selected: null,
	drafting: 0,
	canUndo: false,
	count: 0,
	placingEmoji: null,
};

/** Mapa de un territorio: solo lectura (se encuadra todo lo dibujado) o
 * editable (herramientas según el tipo de territorio). Ocupa todo el contenedor
 * (mapa a sangre) con el encabezado y la barra de herramientas flotando encima;
 * el dibujo inicial (`data`) solo se lee al montar. */
export function TerritoryMap({
	kind,
	data,
	title,
	subtitle,
	onClose,
	footer,
	editable = false,
	onChange,
	searchHint,
}: {
	kind: TerritoryKind;
	/** Encabezado flotante del mapa (volver + título). */
	title: string;
	subtitle?: React.ReactNode;
	onClose: () => void;
	/** Acción principal flotante bajo la barra de herramientas (p. ej. "Guardar mapa"). */
	footer?: React.ReactNode;
	data: TerritoryMapData | null;
	editable?: boolean;
	onChange?: (data: TerritoryMapData) => void;
	/** Dirección para centrar el mapa mientras no haya nada dibujado. */
	searchHint?: string | null;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<TerritoryMapController | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [state, setState] = useState<EditorState>(INITIAL_STATE);
	const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
	const [textValue, setTextValue] = useState("");
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchMessage, setSearchMessage] = useState<string | null>(null);
	const [customEmoji, setCustomEmoji] = useState("");
	const [importing, setImporting] = useState(false);
	const [importMessage, setImportMessage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const hasDrawing = !!boundsOf(data);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let cancelled = false;
		let controller: TerritoryMapController | null = null;

		TerritoryMapController.create(container, {
			kind,
			editable,
			data,
			onChange: (next) => onChangeRef.current?.(next),
			onState: setState,
			onTextRequest: (request) => {
				setTextRequest(request);
				setTextValue(request.value);
			},
		})
			.then((created) => {
				if (cancelled) {
					created.destroy();
					return;
				}
				controller = created;
				controllerRef.current = created;
				setStatus("ready");
				if (!hasDrawing && editable) {
					// Mapa vacío: se intenta centrar en la ubicación actual (el navegador
					// pide permiso) y, si no se puede, en la dirección del Salón.
					void locate(created).then((found) => {
						if (!found && searchHint) void geocode(searchHint, created);
					});
				} else if (!hasDrawing && searchHint) {
					void geocode(searchHint, created);
				}
			})
			.catch((error) => {
				console.error("territory_map_failed", error);
				if (!cancelled) setStatus("error");
			});

		return () => {
			cancelled = true;
			controllerRef.current = null;
			controller?.destroy();
		};
		// El mapa se crea una sola vez; el dibujo inicial solo se lee al montar.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function geocode(text: string, controller: TerritoryMapController): Promise<boolean> {
		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=${encodeURIComponent(text)}`,
			);
			if (!response.ok) return false;
			const results = (await response.json()) as { boundingbox: [string, string, string, string] }[];
			const box = results[0]?.boundingbox;
			if (!box) return false;
			const [south, north, west, east] = box.map(Number) as [number, number, number, number];
			controller.showBox(west, south, east, north);
			return true;
		} catch {
			return false;
		}
	}

	/** Centra el mapa en la ubicación actual; false si no hay permiso o no se pudo. */
	function locate(controller: TerritoryMapController): Promise<boolean> {
		return new Promise((resolve) => {
			if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(false);
			navigator.geolocation.getCurrentPosition(
				(position) => {
					controller.flyToPoint(position.coords.longitude, position.coords.latitude);
					resolve(true);
				},
				() => resolve(false),
				{ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
			);
		});
	}

	async function goToMyLocation() {
		const controller = controllerRef.current;
		if (!controller) return;
		setSearchMessage(null);
		if (!(await locate(controller))) setSearchMessage("No se pudo obtener tu ubicación. Revisa el permiso del navegador.");
	}

	async function search(e: React.FormEvent) {
		e.preventDefault();
		const controller = controllerRef.current;
		if (!controller || !query.trim()) return;
		setSearching(true);
		setSearchMessage(null);
		const found = await geocode(query.trim(), controller);
		if (!found) setSearchMessage("No se encontró ese lugar.");
		setSearching(false);
	}

	async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		const controller = controllerRef.current;
		if (!file || !controller) return;
		setImporting(true);
		setImportMessage(null);
		try {
			const { features, skipped } = await parseMapFile(file, kind, controller.remainingRoom());
			const added = controller.importFeatures(features);
			setImportMessage(
				added === 0
					? "No había nada que se pudiera importar."
					: `Se importaron ${added}${skipped > 0 ? ` (${skipped} omitidos)` : ""}.`,
			);
		} catch (error) {
			setImportMessage(error instanceof ImportError ? error.message : "No se pudo leer el archivo.");
		} finally {
			setImporting(false);
		}
	}

	function submitText(e: React.FormEvent) {
		e.preventDefault();
		if (textRequest && textValue.trim()) controllerRef.current?.submitText(textRequest, textValue);
		setTextRequest(null);
	}

	const tools = TOOL_ORDER.filter((t) => t === "select" || ALLOWED_TOOLS[kind].includes(t as DrawTool));
	const drawing = state.tool === "polygon" || state.tool === "line";
	const selectedPoint = state.selected?.type === "point";
	const showEmojis = editable && (state.tool === "point" || selectedPoint);
	const activeEmoji = selectedPoint ? (state.selected?.emoji ?? null) : state.placingEmoji;
	const showDraftActions = editable && drawing && state.drafting > 0;
	const showSelectionActions = editable && !!state.selected && state.tool === "select";
	const messages = [importMessage, searchMessage].filter((m): m is string => !!m);

	return (
		<div className="relative h-full w-full">
			{/* El CSS de MapLibre le pone position:relative al mapa, por eso va dentro de un contenedor absoluto.
			    Los controles de zoom y la atribución se corren para no quedar bajo el encabezado y la barra flotantes. */}
			<div
				className={`absolute inset-0 bg-surface-alt [&_.maplibregl-ctrl-top-right]:mt-[76px] ${
					editable ? "[&_.maplibregl-ctrl-bottom-right]:mb-44" : "[&_.maplibregl-ctrl-bottom-right]:mb-4"
				}`}
			>
				<div ref={containerRef} className="h-full w-full" />
			</div>

			{status === "loading" && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-alt">
					<Spinner size={40} />
				</div>
			)}
			{status === "error" && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-alt p-6 text-center text-sm text-ink-soft">
					No se pudo cargar el mapa. Revisa tu conexión e intenta de nuevo.
				</div>
			)}

			<MapHeader title={title} subtitle={subtitle} onClose={onClose}>
				{editable && (
					<>
						<IconButton
							label="Buscar calle o lugar"
							icon={Search}
							tone={searchOpen ? "accent" : "plain"}
							onClick={() => setSearchOpen((v) => !v)}
						/>
						<IconButton label="Ir a mi ubicación" icon={LocateFixed} onClick={goToMyLocation} />
					</>
				)}
			</MapHeader>

			{editable && searchOpen && (
				<form
					onSubmit={search}
					className="absolute inset-x-3 top-[76px] z-20 flex items-center gap-1 rounded-full bg-surface/95 py-1 pl-4 pr-1 shadow-md md:left-auto md:w-96"
				>
					<input
						autoFocus
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Buscar calle o lugar"
						className="min-w-0 flex-1 bg-transparent py-2 text-base text-ink placeholder:text-ink-soft focus:outline-none sm:text-sm"
					/>
					<button
						type="submit"
						disabled={searching}
						aria-label="Buscar"
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-50"
					>
						<Search size={18} />
					</button>
				</form>
			)}

			{editable && (
				<div className={`absolute left-3 z-10 flex flex-col gap-2 ${searchOpen ? "top-[136px]" : "top-[76px]"}`}>
					<div className="rounded-full bg-surface/95 shadow-md">
						<IconButton label="Encuadrar todo" icon={Maximize2} disabled={state.count === 0} onClick={() => controllerRef.current?.fitAll()} />
					</div>
					<div className="rounded-full bg-surface/95 shadow-md">
						<IconButton
							label="Importar un archivo KML, KMZ o GeoJSON"
							icon={Upload}
							disabled={importing}
							onClick={() => fileInputRef.current?.click()}
						/>
					</div>
					<input ref={fileInputRef} type="file" accept=".kml,.kmz,.geojson,.json" className="hidden" onChange={importFile} />
				</div>
			)}

			<div className="pointer-events-none absolute inset-x-3 bottom-4 z-10 mx-auto flex max-w-md flex-col items-center gap-2.5 pb-[env(safe-area-inset-bottom)]">
				{messages.map((m) => (
					<div key={m} className="pointer-events-auto rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink-soft shadow-md">
						{m}
					</div>
				))}

				{status === "ready" && !editable && !hasDrawing && (
					<div className="rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink-soft shadow-md">
						Este territorio todavía no tiene nada dibujado.
					</div>
				)}

				{textRequest && (
					<form
						onSubmit={submitText}
						className="pointer-events-auto flex w-full items-center gap-1 rounded-full bg-surface py-1.5 pl-4 pr-1.5 shadow-md"
					>
						<input
							autoFocus
							value={textValue}
							onChange={(e) => setTextValue(e.target.value)}
							maxLength={200}
							placeholder="Texto del mapa"
							className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-ink placeholder:text-ink-soft focus:outline-none sm:text-sm"
						/>
						<IconButton label="Cancelar" icon={X} onClick={() => setTextRequest(null)} />
						<button
							type="submit"
							disabled={!textValue.trim()}
							aria-label={textRequest.id ? "Guardar texto" : "Agregar texto"}
							className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-50"
						>
							<Check size={20} />
						</button>
					</form>
				)}

				{(showDraftActions || showSelectionActions) && (
					<div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface py-1 pl-1 pr-1 shadow-md">
						{showDraftActions && (
							<>
								<Button onClick={() => controllerRef.current?.finishDraft()}>
									<Check size={16} />
									Terminar
								</Button>
								<IconButton label="Cancelar" icon={X} onClick={() => controllerRef.current?.cancelDraft()} />
							</>
						)}
						{showSelectionActions && state.selected?.type === "text" && (
							<IconButton label="Editar texto" icon={Pencil} onClick={() => controllerRef.current?.editSelectedText()} />
						)}
						{showSelectionActions && (
							<IconButton label="Eliminar" icon={Trash2} tone="danger" onClick={() => controllerRef.current?.deleteSelected()} />
						)}
					</div>
				)}

				{showEmojis && (
					<div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface/95 px-2 py-1.5 shadow-md">
						<Tooltip content="Punto simple">
							<button
								type="button"
								aria-label="Punto simple"
								onClick={() => controllerRef.current?.chooseEmoji(null)}
								className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activeEmoji === null ? "bg-accent-soft" : "hover:bg-surface-alt"}`}
							>
								<span className="h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow" />
							</button>
						</Tooltip>
						{POINT_EMOJIS.map((emoji) => (
							<button
								key={emoji}
								type="button"
								onClick={() => controllerRef.current?.chooseEmoji(emoji)}
								className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl ${activeEmoji === emoji ? "bg-accent-soft" : "hover:bg-surface-alt"}`}
							>
								{emoji}
							</button>
						))}
						<input
							value={customEmoji}
							onChange={(e) => setCustomEmoji(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && customEmoji.trim()) {
									e.preventDefault();
									controllerRef.current?.chooseEmoji(customEmoji.trim());
									setCustomEmoji("");
								}
							}}
							maxLength={8}
							placeholder="Otro + Enter"
							className="h-9 w-28 shrink-0 rounded-full border border-border bg-surface px-3 text-base text-ink focus:border-accent focus:outline-none sm:text-sm"
						/>
					</div>
				)}

				{editable && (
					<div className="pointer-events-auto flex h-16 w-full items-center justify-around rounded-full bg-surface px-2 shadow-lg">
						{tools.map((t) => {
							const meta = TOOL_META[t];
							const active = state.tool === t;
							return (
								<Tooltip
									key={t}
									content={
										<>
											<span className="block font-semibold">{meta.label}</span>
											<span className="block font-normal opacity-80">{meta.hint}</span>
										</>
									}
								>
									<button
										type="button"
										aria-label={meta.label}
										aria-pressed={active}
										onClick={() => controllerRef.current?.setTool(t)}
										className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
											active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-alt"
										}`}
									>
										<meta.icon size={22} />
									</button>
								</Tooltip>
							);
						})}
						<Tooltip content="Deshacer">
							<button
								type="button"
								aria-label="Deshacer"
								disabled={!state.canUndo}
								onClick={() => controllerRef.current?.undo()}
								className="flex h-12 w-12 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt disabled:opacity-40"
							>
								<Undo2 size={22} />
							</button>
						</Tooltip>
					</div>
				)}

				{footer && <div className="pointer-events-auto flex w-full flex-col items-stretch gap-2">{footer}</div>}
			</div>
		</div>
	);
}
