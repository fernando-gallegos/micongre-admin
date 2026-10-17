// Modelo neutro de un reporte: el servidor arma un ReportDoc (con los datos y
// los permisos ya resueltos) y el navegador lo convierte a Word (.docx), imagen
// (.png) o Excel (.xlsx). Seguro de importar en servidor y cliente.

export type Cell = string | number | null;

export interface ReportColumn {
	label: string;
	/** Ancho relativo (por defecto 1). */
	width?: number;
	align?: "left" | "center" | "right";
}

export interface ReportTable {
	columns: ReportColumn[];
	rows: Cell[][];
	/** Nombre de la hoja si se exporta a Excel (por defecto el encabezado o «Hoja N»). */
	sheetName?: string;
}

export type ReportBlock =
	| { type: "heading"; text: string; level?: 1 | 2 | 3 }
	| { type: "paragraph"; text: string; muted?: boolean }
	| { type: "keyValue"; items: { label: string; value: string }[] }
	| { type: "table"; table: ReportTable; caption?: string }
	/** Imagen PNG (data URL) con su tamaño en píxeles de pantalla. */
	| { type: "image"; dataUrl: string; width: number; height: number; caption?: string }
	/** Dibujo SVG (el servidor no puede rasterizar): el navegador lo convierte a PNG antes de generar el archivo. */
	| {
			type: "svg";
			svg: string;
			width: number;
			height: number;
			caption?: string;
			/** El dibujo va sobre el mapa base: el navegador lo dibuja (mismo centro y zoom de MapLibre, 512 px por mosaico) y lo pone de fondo del SVG. */
			/** Versión en texto de la hoja, para Word (editable). Sin ella, Word recibe el dibujo como imagen. */
			native?: NativeLine[];
			/** En PNG, este dibujo es un archivo propio (varios se entregan en un .zip). */
			standalone?: boolean;
			basemap?: { center: [number, number]; zoom: number; rect?: { x: number; y: number; width: number; height: number } };
	  }
	| { type: "pageBreak" };

/** Contenido de una hoja oficial como líneas de texto: Word las dibuja como texto editable (no como imagen). */
export type NativeLine =
	| { k: "head"; left: string; right: string }
	| { k: "week"; text: string }
	| { k: "kv"; label: string; value: string }
	| { k: "bar"; label: string; color: string; cols?: string[] }
	| { k: "row"; time?: string; title: string; main?: string; aux?: string; role?: string; bold?: boolean; sub?: string[] }
	| { k: "rule" }
	| { k: "title"; text: string }
	| { k: "field"; label: string; value: string }
	| { k: "check"; label: string; on: boolean }
	| { k: "text"; text: string; bold?: boolean; italic?: boolean; size?: number };

export interface ReportDoc {
	title: string;
	subtitle?: string;
	/** Nombre del archivo sin extensión. */
	fileName: string;
	landscape?: boolean;
	/** Sin título, subtítulo ni pie: el contenido ya trae su propio encabezado (formatos oficiales dibujados). */
	bare?: boolean;
	/** Tema visual (lo pone el servidor según la congregación; los oficiales llevan «plain»). */
	theme?: string;
	blocks: ReportBlock[];
	footer?: string;
}

export type ExportFormat = "docx" | "png" | "xlsx";

export const FORMAT_LABEL: Record<ExportFormat, string> = {
	png: "Imagen (PNG)",
	docx: "Word (DOCX)",
	xlsx: "Excel (XLSX)",
};
