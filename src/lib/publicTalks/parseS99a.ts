// Extrae el catálogo de bosquejos del EPUB oficial S-99a ("Títulos de los
// discursos públicos ordenados por temas"). Igual que src/lib/mwb/parseProgram.ts,
// el EPUB es un ZIP estándar descomprimido en memoria con `fflate` y recorrido
// con expresiones regulares (Cloudflare Workers no trae DOMParser).
//
// Estructura verificada del XHTML principal: una serie de bloques
// `<div class="section">` con un `<h2><strong>CATEGORÍA</strong></h2>` seguido
// de un `<div class="pGroup">` con un `<p>NÚMERO. Título</p>` por bosquejo.
// Las entradas "(No está disponible)" se omiten.

import { unzipSync } from "fflate";

export interface ParsedTalkOutline {
	number: number;
	category: string;
	title: string;
}

const CATEGORY_RE = /<h2[^>]*>(?:<span[^>]*><\/span>)?<strong>([\s\S]*?)<\/strong>\s*<\/h2>/g;
const ENTRY_RE = /<p[^>]*>\s*(\d+)\.\s*([\s\S]*?)<\/p>/g;
const NOT_AVAILABLE_RE = /no est[aá] disponible/i;

function stripTags(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function parseOutlinesFromHtml(html: string): ParsedTalkOutline[] {
	const categories = [...html.matchAll(CATEGORY_RE)].map((m) => ({
		index: m.index ?? 0,
		name: stripTags(m[1]),
	}));
	if (categories.length === 0) return [];

	const outlines: ParsedTalkOutline[] = [];
	for (let i = 0; i < categories.length; i++) {
		const from = categories[i].index;
		const to = categories[i + 1]?.index ?? html.length;
		const section = html.slice(from, to);

		for (const entry of section.matchAll(ENTRY_RE)) {
			const title = stripTags(entry[2]);
			if (!title || NOT_AVAILABLE_RE.test(title)) continue;
			outlines.push({ number: Number(entry[1]), category: categories[i].name, title });
		}
	}
	return outlines;
}

export function parseS99aEpub(epubBytes: ArrayBuffer): ParsedTalkOutline[] {
	const files = unzipSync(new Uint8Array(epubBytes));
	const decoder = new TextDecoder("utf-8");

	for (const [name, data] of Object.entries(files)) {
		if (!/\.x?html$/i.test(name) || /cover|toc/i.test(name)) continue;

		const html = decoder.decode(data);
		const outlines = parseOutlinesFromHtml(html);
		if (outlines.length > 0) return outlines;
	}

	return [];
}
