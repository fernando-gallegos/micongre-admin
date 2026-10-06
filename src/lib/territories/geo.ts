// Dibujo vectorial de un territorio: GeoJSON restringido a lo que se puede
// dibujar en el editor (polígonos, líneas, puntos y textos). Seguro de importar
// tanto en el servidor como en el bundle cliente.

export type LngLat = [number, number];

export type TerritoryGeometry =
	| { type: "Point"; coordinates: LngLat }
	| { type: "LineString"; coordinates: LngLat[] }
	| { type: "Polygon"; coordinates: LngLat[][] };

export interface TerritoryFeatureProperties {
	/** Id propio del elemento dibujado (el editor lo usa para seleccionar). */
	fid: string;
	/** "text" = rótulo de texto (Point con `text`); sin valor = figura normal. */
	kind?: "text";
	text?: string;
	/** Solo puntos: emoji que se muestra en lugar del punto (sin valor = punto). */
	emoji?: string;
}

/** Emojis que ofrece el editor para los puntos (también se puede escribir otro). */
export const POINT_EMOJIS = ["📍", "🏠", "🏢", "🏫", "⛪", "🛒", "🅿️", "🚏", "🚫", "⚠️", "🐕", "🔒", "🔔", "👥", "✅", "❌"];
export const DEFAULT_POINT_EMOJI = "📍";

export interface TerritoryFeature {
	type: "Feature";
	geometry: TerritoryGeometry;
	properties: TerritoryFeatureProperties;
}

export interface TerritoryMapData {
	type: "FeatureCollection";
	features: TerritoryFeature[];
}

export type TerritoryKind = "general" | "public_preaching";

export const TERRITORY_KIND_LABEL: Record<TerritoryKind, string> = {
	general: "General",
	public_preaching: "Predicación pública",
};

export type DrawTool = "polygon" | "line" | "point" | "text";

/** Qué se puede dibujar en el mapa de cada tipo de territorio. */
export const ALLOWED_TOOLS: Record<TerritoryKind, DrawTool[]> = {
	general: ["polygon", "line", "point", "text"],
	public_preaching: ["point", "text"],
};

/** Los elementos del dibujo que el tipo de territorio no admite. */
export function hasDisallowedFeatures(data: TerritoryMapData, kind: TerritoryKind): boolean {
	if (kind === "general") return false;
	return data.features.some((f) => f.geometry.type !== "Point");
}

export const MAX_FEATURES = 500;
export const MAX_MAP_DATA_CHARS = 400_000;

export function emptyMapData(): TerritoryMapData {
	return { type: "FeatureCollection", features: [] };
}

export function allCoordinates(data: TerritoryMapData | null | undefined): LngLat[] {
	if (!data) return [];
	const out: LngLat[] = [];
	for (const f of data.features) {
		const g = f.geometry;
		if (g.type === "Point") out.push(g.coordinates);
		else if (g.type === "LineString") out.push(...g.coordinates);
		else for (const ring of g.coordinates) out.push(...ring);
	}
	return out;
}

/** [oeste, sur, este, norte] de todo lo dibujado, o null si no hay nada. */
export function boundsOf(data: TerritoryMapData | null | undefined): [number, number, number, number] | null {
	const coords = allCoordinates(data);
	if (coords.length === 0) return null;
	let w = Infinity;
	let s = Infinity;
	let e = -Infinity;
	let n = -Infinity;
	for (const [lng, lat] of coords) {
		if (lng < w) w = lng;
		if (lng > e) e = lng;
		if (lat < s) s = lat;
		if (lat > n) n = lat;
	}
	return [w, s, e, n];
}

export function parseMapData(raw: string | null | undefined): TerritoryMapData | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as TerritoryMapData;
		return parsed && parsed.type === "FeatureCollection" && Array.isArray(parsed.features) ? parsed : null;
	} catch {
		return null;
	}
}
