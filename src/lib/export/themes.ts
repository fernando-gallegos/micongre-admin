// Temas de los reportes (Word, imagen y Excel). Los formatos oficiales (S-12, S-21, S-89, S-140 y el
// programa del fin de semana, que usa su diseño) no los usan: siempre salen en el estilo «plain».
// Seguro de importar en servidor y cliente.

export const REPORT_THEME_IDS = ["salvia", "oceano", "atardecer", "lavanda", "grafito"] as const;
export type ReportThemeId = (typeof REPORT_THEME_IDS)[number];
export const DEFAULT_REPORT_THEME: ReportThemeId = "salvia";

export type TitleStyle = "centered" | "band" | "rule" | "badge" | "stacked";

export interface ReportTheme {
	id: ReportThemeId | "plain";
	name: string;
	tagline: string;
	/** Color principal (títulos, acentos) y su versión oscura. */
	primary: string;
	dark: string;
	/** Fondo suave para recuadros y filas alternas. */
	soft: string;
	/** Color de acento (líneas, detalles). */
	accent: string;
	text: string;
	muted: string;
	border: string;
	headerFill: string;
	headerText: string;
	zebra: string;
	titleStyle: TitleStyle;
	/** Familias CSS para la imagen y nombres de fuente para Word. */
	headingFont: string;
	bodyFont: string;
	docxHeadingFont: string;
	docxBodyFont: string;
	upperHeaders: boolean;
}

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "'Public Sans', 'Segoe UI', Arial, sans-serif";

export const REPORT_THEMES: Record<ReportThemeId, ReportTheme> = {
	salvia: {
		id: "salvia",
		name: "Salvia",
		tagline: "Verde sereno y clásico",
		primary: "#3F6B52",
		dark: "#2F5140",
		soft: "#E7F0EA",
		accent: "#A9C4B2",
		text: "#1C1B17",
		muted: "#6C6658",
		border: "#C9D8CE",
		headerFill: "#3F6B52",
		headerText: "#FFFFFF",
		zebra: "#F2F8F4",
		titleStyle: "centered",
		headingFont: SERIF,
		bodyFont: SANS,
		docxHeadingFont: "Georgia",
		docxBodyFont: "Calibri",
		upperHeaders: false,
	},
	oceano: {
		id: "oceano",
		name: "Océano",
		tagline: "Azul profundo, limpio y moderno",
		primary: "#0E6BA8",
		dark: "#0B3C5D",
		soft: "#E3F1FA",
		accent: "#5BB4E5",
		text: "#10222F",
		muted: "#52687A",
		border: "#B9D6EA",
		headerFill: "#0B3C5D",
		headerText: "#FFFFFF",
		zebra: "#F0F8FD",
		titleStyle: "band",
		headingFont: SANS,
		bodyFont: SANS,
		docxHeadingFont: "Calibri",
		docxBodyFont: "Calibri",
		upperHeaders: false,
	},
	atardecer: {
		id: "atardecer",
		name: "Atardecer",
		tagline: "Coral y dorado, cálido",
		primary: "#E4572E",
		dark: "#B8401D",
		soft: "#FFF1E6",
		accent: "#F2A541",
		text: "#2B1B14",
		muted: "#7A5C4E",
		border: "#F3CDB5",
		headerFill: "#E4572E",
		headerText: "#FFFFFF",
		zebra: "#FFF7F0",
		titleStyle: "rule",
		headingFont: SERIF,
		bodyFont: SANS,
		docxHeadingFont: "Georgia",
		docxBodyFont: "Calibri",
		upperHeaders: false,
	},
	lavanda: {
		id: "lavanda",
		name: "Lavanda",
		tagline: "Lila elegante y suave",
		primary: "#7B5EA7",
		dark: "#56407D",
		soft: "#F0EAF8",
		accent: "#C3A9E6",
		text: "#241B33",
		muted: "#6B5F7D",
		border: "#D9CCEC",
		headerFill: "#7B5EA7",
		headerText: "#FFFFFF",
		zebra: "#F8F4FC",
		titleStyle: "badge",
		headingFont: SERIF,
		bodyFont: SANS,
		docxHeadingFont: "Cambria",
		docxBodyFont: "Calibri",
		upperHeaders: false,
	},
	grafito: {
		id: "grafito",
		name: "Grafito",
		tagline: "Carbón y oro, sobrio y nítido",
		primary: "#1F2937",
		dark: "#111827",
		soft: "#F3F4F6",
		accent: "#D4A017",
		text: "#111827",
		muted: "#6B7280",
		border: "#D1D5DB",
		headerFill: "#1F2937",
		headerText: "#FFFFFF",
		zebra: "#F6F7F9",
		titleStyle: "stacked",
		headingFont: SANS,
		bodyFont: SANS,
		docxHeadingFont: "Arial",
		docxBodyFont: "Arial",
		upperHeaders: true,
	},
};

/** Estilo neutro de siempre: lo usan los formatos oficiales. */
export const PLAIN_THEME: ReportTheme = {
	id: "plain",
	name: "Oficial",
	tagline: "Sin tema",
	primary: "#1C1B17",
	dark: "#1C1B17",
	soft: "#ECE8DE",
	accent: "#B8B2A3",
	text: "#1C1B17",
	muted: "#6C6658",
	border: "#B8B2A3",
	headerFill: "#ECE8DE",
	headerText: "#1C1B17",
	zebra: "#FFFFFF",
	titleStyle: "centered",
	headingFont: SERIF,
	bodyFont: SANS,
	docxHeadingFont: "Calibri",
	docxBodyFont: "Calibri",
	upperHeaders: false,
};

/** Reportes en formato oficial: nunca llevan el tema de la congregación. */
export const OFFICIAL_REPORT_KINDS = new Set(["s21", "s140", "weekend-program", "s89", "territories-cards"]);

export function isReportThemeId(value: unknown): value is ReportThemeId {
	return typeof value === "string" && (REPORT_THEME_IDS as readonly string[]).includes(value);
}

export function getReportTheme(id: string | null | undefined): ReportTheme {
	return isReportThemeId(id) ? REPORT_THEMES[id] : id === "plain" ? PLAIN_THEME : PLAIN_THEME;
}
