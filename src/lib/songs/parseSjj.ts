// Extrae el catálogo de canciones del EPUB «Cantemos con gozo» (sjj). Igual que parseS99a.ts, el EPUB es un ZIP que se
// descomprime en memoria con fflate y se recorre con expresiones regulares (los Workers no traen DOMParser).
//
// Estructura verificada: un XHTML por canción con `<strong>CANCIÓN N</strong>` en el encabezado y el título en `<h1><strong>…</strong></h1>`.
// Los archivos «-extracted» no traen la canción y se ignoran solos.

import { unzipSync } from "fflate";

export interface ParsedSong {
	number: number;
	title: string;
}

const NUMBER_RE = /CANCI[ÓO]N\s+(\d+)\s*<\/strong>/i;
const TITLE_RE = /<h1[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/h1>/i;

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

export function parseSjjEpub(epubBytes: ArrayBuffer): ParsedSong[] {
	const files = unzipSync(new Uint8Array(epubBytes));
	const decoder = new TextDecoder("utf-8");
	const byNumber = new Map<number, string>();

	for (const [name, data] of Object.entries(files)) {
		if (!/\.x?html$/i.test(name)) continue;
		const html = decoder.decode(data);
		const number = NUMBER_RE.exec(html);
		const title = TITLE_RE.exec(html);
		if (!number || !title) continue;
		const text = decodeEntities(title[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
		if (text) byNumber.set(Number(number[1]), text);
	}

	return [...byNumber.entries()].sort(([a], [b]) => a - b).map(([number, title]) => ({ number, title }));
}
