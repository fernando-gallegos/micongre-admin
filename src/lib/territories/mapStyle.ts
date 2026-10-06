// Mapa base gratuito: teselas vectoriales de OpenFreeMap (datos de OpenStreetMap,
// sin llave ni cuota). Se parte de su estilo "bright" (mapa normal, no
// satelital) y se le quitan los nombres de lugares: ciudades, colonias, países,
// agua, aeropuertos, límites y escudos de carreteras. Quedan los nombres de
// calles y los lugares de interés.

const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

// Capas (por source-layer) que se quitan del estilo original.
const HIDDEN_SOURCE_LAYERS = new Set(["place", "water_name", "aerodrome_label", "boundary", "housenumber", "mountain_peak"]);
const HIDDEN_LAYER_IDS = new Set(["waterway_line_label", "highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us"]);

interface StyleLayer {
	id: string;
	type: string;
	source?: string;
	"source-layer"?: string;
	minzoom?: number;
	layout?: Record<string, unknown>;
	paint?: Record<string, unknown>;
}

export interface BaseMapStyle {
	layers: StyleLayer[];
	[key: string]: unknown;
}

let cached: Promise<BaseMapStyle> | null = null;

async function loadStyle(): Promise<BaseMapStyle> {
	const response = await fetch(STYLE_URL);
	if (!response.ok) throw new Error(`map_style_${response.status}`);
	const style = (await response.json()) as BaseMapStyle;

	style.layers = style.layers
		.filter((l) => !HIDDEN_LAYER_IDS.has(l.id) && !(l["source-layer"] && HIDDEN_SOURCE_LAYERS.has(l["source-layer"])))
		.map((l) => {
			// Nombres de calle: el nombre local (no la traducción al inglés) y un poco
			// más grandes y visibles, desde un zoom más lejano.
			if (l["source-layer"] === "transportation_name" && l.type === "symbol") {
				return {
					...l,
					minzoom: Math.min(l.minzoom ?? 14, 14),
					layout: {
						...l.layout,
						"text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
						"text-size": ["interpolate", ["linear"], ["zoom"], 13, 12, 16, 14, 19, 16],
					},
					paint: { ...l.paint, "text-color": "#374151", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
				};
			}
			return l;
		});

	return style;
}

/** Estilo del mapa base (se descarga una sola vez por carga de página). */
export function getBaseMapStyle(): Promise<BaseMapStyle> {
	if (!cached) {
		cached = loadStyle().catch((error) => {
			cached = null;
			throw error;
		});
	}
	return cached;
}
