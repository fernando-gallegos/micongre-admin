// Extrae el programa de una semana desde el EPUB de la Guía de actividades
// (mwb). El EPUB es un ZIP estándar; se descomprime en memoria con `fflate` y
// se recorre el XHTML del capítulo correspondiente con expresiones
// regulares — Cloudflare Workers no trae `DOMParser`, y el proyecto ya evita
// dependencias con bindings nativos (ver PBKDF2 en vez de bcrypt).
//
// La extracción se apoya en dos anclas estables del formato real (verificado
// contra el número 202609 vigente): los encabezados de sección en mayúsculas
// ("TESOROS DE LA BIBLIA", "SEAMOS MEJORES MAESTROS", "NUESTRA VIDA
// CRISTIANA") y el orden de documento de los ítems numerados dentro de cada
// sección — nunca el texto exacto de un ítem, que cambia cada semana.

import { unzipSync } from "fflate";
import { issueCodeForWeek, toISODate } from "./dates";
import type { ParsedLivingPart, ParsedProgram, ParsedProgramPart } from "./types";

const SECTION_TREASURES = "TESOROS DE LA BIBLIA";
const SECTION_STUDENT = "SEAMOS MEJORES MAESTROS";
const SECTION_LIVING = "NUESTRA VIDA CRISTIANA";

const SONG_RE = /Canci[oó]n\s+(\d+)/gi;
const DURATION_RE = /\((\d+)\s*min[s]?\.?\)/i;
// Encabezado numerado de una parte del programa: <h3 ...>[<span .../>]<strong>N. Título</strong></h3>
// El span opcional vacío es un marcador de número de página que a veces aparece antes del <strong>.
const NUMBERED_HEADING_RE = /<h3[^>]*>(?:<span[^>]*><\/span>)?<strong>(\d+)\.\s*([\s\S]*?)<\/strong>\s*<\/h3>/g;

const SPANISH_MONTHS: Record<string, number> = {
	enero: 1,
	febrero: 2,
	marzo: 3,
	abril: 4,
	mayo: 5,
	junio: 6,
	julio: 7,
	agosto: 8,
	septiembre: 9,
	octubre: 10,
	noviembre: 11,
	diciembre: 12,
};

interface HeadingMatch {
	number: number;
	index: number;
	endIndex: number;
	title: string;
}

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

/** Convierte el encabezado de una semana ("6-12 de julio" / "28 de
 * septiembre a 4 de octubre") en la fecha ISO de su lunes, usando el año del
 * número (`issue`, formato YYYYMM) del que se descargó el archivo. */
function parseWeekStartFromTitle(title: string, issue: string): string | null {
	const issueYear = Number(issue.slice(0, 4));

	const sameMonth = title.match(/^(\d{1,2})\s*[-–]\s*\d{1,2}\s+de\s+([a-záéíóúñ]+)$/iu);
	if (sameMonth) {
		const month = SPANISH_MONTHS[sameMonth[2].toLowerCase()];
		if (!month) return null;
		return toISODate(new Date(Date.UTC(issueYear, month - 1, Number(sameMonth[1]))));
	}

	const crossMonth = title.match(/^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+a\s+\d{1,2}\s+de\s+([a-záéíóúñ]+)$/iu);
	if (crossMonth) {
		const month = SPANISH_MONTHS[crossMonth[2].toLowerCase()];
		if (!month) return null;
		return toISODate(new Date(Date.UTC(issueYear, month - 1, Number(crossMonth[1]))));
	}

	return null;
}

function extractNumberedHeadings(html: string): HeadingMatch[] {
	const headings: HeadingMatch[] = [];
	const re = new RegExp(NUMBERED_HEADING_RE);
	let match: RegExpExecArray | null;
	while ((match = re.exec(html))) {
		headings.push({
			number: Number(match[1]),
			index: match.index,
			endIndex: match.index + match[0].length,
			title: stripTags(match[2]),
		});
	}
	return headings;
}

function findDuration(html: string, from: number, to: number): number | null {
	const match = html.slice(from, to).match(DURATION_RE);
	return match ? Number(match[1]) : null;
}

/** Texto del primer párrafo tras un encabezado, sin el paréntesis de
 * duración inicial — usado para la cita de "Lectura de la Biblia" y el
 * material del Estudio bíblico de la congregación, cuyo <h3> es siempre una
 * etiqueta genérica y el dato real va en el párrafo siguiente. */
function findFollowingText(html: string, from: number, to: number): string | null {
	const window = html.slice(from, to);
	const paragraph = window.match(/<p[^>]*>([\s\S]*?)<\/p>/);
	if (!paragraph) return null;
	const text = stripTags(paragraph[1]).replace(DURATION_RE, "").trim().replace(/^[.:]\s*/, "");
	return text || null;
}

/** Solo el PRIMER párrafo tras un encabezado, sin el paréntesis de duración
 * inicial (la duración se guarda aparte): es la línea de instrucciones de la
 * parte ("PREDICACIÓN INFORMAL. Ofrézcale un curso…"). Es null cuando el
 * párrafo era solo la duración, como en "Tesoros" y "Perlas escondidas". */
function findFirstParagraph(html: string, from: number, to: number): string | null {
	return findFollowingText(html, from, to);
}

function buildParsedProgram(html: string, weekLabel: string): ParsedProgram | null {
	const treasuresIdx = html.indexOf(SECTION_TREASURES);
	const studentIdx = html.indexOf(SECTION_STUDENT);
	const livingIdx = html.indexOf(SECTION_LIVING);
	if (treasuresIdx === -1 || studentIdx === -1 || livingIdx === -1) return null;

	const headings = extractNumberedHeadings(html);
	const treasuresHeadings = headings.filter((h) => h.index > treasuresIdx && h.index < studentIdx);
	const studentHeadings = headings.filter((h) => h.index > studentIdx && h.index < livingIdx);
	const livingHeadings = headings.filter((h) => h.index > livingIdx);

	if (treasuresHeadings.length < 3 || studentHeadings.length < 1 || livingHeadings.length < 1) return null;

	const boundaryAfter = (heading: HeadingMatch): number => {
		const pos = headings.indexOf(heading);
		return headings[pos + 1]?.index ?? html.length;
	};

	const partFor = (heading: HeadingMatch): ParsedProgramPart => ({
		number: heading.number,
		title: heading.title || null,
		durationMinutes: findDuration(html, heading.endIndex, boundaryAfter(heading)),
		description: findFirstParagraph(html, heading.endIndex, boundaryAfter(heading)),
	});

	const [talkH, gemsH, readingH] = treasuresHeadings;
	const cbsH = livingHeadings[livingHeadings.length - 1];
	const remainingLiving = livingHeadings.slice(0, -1);

	const treasuresTalk = partFor(talkH);
	const spiritualGems: ParsedProgramPart = {
		number: gemsH.number,
		title: null,
		durationMinutes: findDuration(html, gemsH.endIndex, boundaryAfter(gemsH)),
		description: findFirstParagraph(html, gemsH.endIndex, boundaryAfter(gemsH)),
	};
	const bibleReading: ParsedProgramPart = {
		number: readingH.number,
		title: findFollowingText(html, readingH.endIndex, boundaryAfter(readingH)),
		durationMinutes: findDuration(html, readingH.endIndex, boundaryAfter(readingH)),
		description: null,
	};
	const studentParts = studentHeadings.map(partFor);
	const cbs: ParsedProgramPart = {
		number: cbsH.number,
		title: findFollowingText(html, cbsH.endIndex, boundaryAfter(cbsH)),
		durationMinutes: findDuration(html, cbsH.endIndex, boundaryAfter(cbsH)),
		description: null,
	};

	const isNeeds = (heading: HeadingMatch) => /necesidades de la congregaci[oó]n/i.test(heading.title);
	let needsHeading = remainingLiving.find(isNeeds) ?? null;
	// Sin título reconocible, la convención de siempre: con 2+ partes la segunda
	// son las necesidades de la congregación.
	if (!needsHeading && remainingLiving.length >= 2) needsHeading = remainingLiving[1];
	let christianLivingTaken = false;
	const livingParts: ParsedLivingPart[] = remainingLiving.map((heading) => {
		if (heading === needsHeading) return { kind: "congregation_needs", part: partFor(heading) };
		if (!christianLivingTaken) {
			christianLivingTaken = true;
			return { kind: "christian_living", part: partFor(heading) };
		}
		return { kind: "living_custom", part: partFor(heading) };
	});

	const songNumbers = [...html.matchAll(SONG_RE)].map((m) => Number(m[1]));

	return {
		weekLabel,
		openingSongNumber: songNumbers[0] ?? null,
		middleSongNumber: songNumbers.length > 2 ? songNumbers[1] : null,
		closingSongNumber: songNumbers.length > 1 ? songNumbers[songNumbers.length - 1] : null,
		treasuresTalk,
		spiritualGems,
		bibleReading,
		studentParts,
		livingParts,
		cbs,
	};
}

/** Programas de varias semanas (lunes ISO) de un mismo EPUB — se descomprime
 * una sola vez. Las semanas que no se encuentran simplemente no aparecen. */
export function parseWeekPrograms(epubBytes: ArrayBuffer, weekStarts: string[]): Map<string, ParsedProgram> {
	const wanted = new Set(weekStarts);
	const programs = new Map<string, ParsedProgram>();
	if (wanted.size === 0) return programs;

	const issue = issueCodeForWeek(weekStarts[0]);
	const files = unzipSync(new Uint8Array(epubBytes));
	const decoder = new TextDecoder("utf-8");

	for (const [name, data] of Object.entries(files)) {
		if (!/\.x?html$/i.test(name)) continue;

		const raw = decoder.decode(data);
		const mainHtml = raw.split('<div class="groupExt"')[0];
		if (!mainHtml.includes(SECTION_TREASURES)) continue;

		const titleMatch = raw.match(/<title>([^<]*)<\/title>/);
		const weekLabel = titleMatch ? stripTags(titleMatch[1]) : null;
		if (!weekLabel) continue;

		const weekStart = parseWeekStartFromTitle(weekLabel, issue);
		if (!weekStart || !wanted.has(weekStart) || programs.has(weekStart)) continue;

		const program = buildParsedProgram(mainHtml, weekLabel);
		if (program) programs.set(weekStart, program);
	}

	return programs;
}
