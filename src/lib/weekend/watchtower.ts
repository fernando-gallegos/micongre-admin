// Artículo de estudio de La Atalaya (edición de estudio) de cada semana, directo de JW.ORG: título y las dos canciones (la del inicio y la
// final). Igual que la guía de actividades (mwb), se baja el EPUB del endpoint público de medios y se recorre con expresiones regulares.
//
// Estructura verificada: un XHTML por artículo de estudio, con el encabezado `<p class="contextTtl"><strong>7-13 DE DICIEMBRE DE 2026</strong></p>`,
// `CANCIÓN N` al inicio (en el encabezado) y otra `CANCIÓN N` al final, y el título en `<h1><strong>…</strong></h1>`. La edición de un mes trae
// los estudios de dos meses después (la de octubre de 2026, los de diciembre de 2026).

import { and, eq, gte, lte } from "drizzle-orm";
import { unzipSync } from "fflate";
import type { Database } from "@/db/client";
import { weekendMeetings } from "@/db/schema";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { ensureSongsCatalog } from "@/lib/songs/catalog";

const MEDIA_LINKS_URL = "https://pubmedia.jw-api.org/GETPUBMEDIALINKS";
const USER_AGENT = "jwlibrary-android";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export interface WatchtowerStudy {
	/** Lunes de la semana (AAAA-MM-DD). */
	weekStart: string;
	title: string;
	openingSong: number | null;
	closingSong: number | null;
}

/** Edición (AAAAMM) de La Atalaya de estudio donde sale el estudio de la semana: dos meses antes del mes de su lunes. */
export function watchtowerIssueForWeek(mondayISO: string): string {
	const monday = parseISODate(mondayISO);
	const index = monday.getUTCFullYear() * 12 + monday.getUTCMonth() - 2;
	return `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, "0")}`;
}

function normalize(text: string): string {
	return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

/** «7-13 DE DICIEMBRE DE 2026», «28 DE DICIEMBRE DE 2026-3 DE ENERO DE 2027» o «30 DE NOVIEMBRE-6 DE DICIEMBRE DE 2026» → lunes ISO. */
export function parseWeekHeader(header: string): string | null {
	const parts = normalize(decodeEntities(header)).split(/[-–—]/);
	if (parts.length !== 2) return null;
	const read = (part: string) => ({
		day: /(\d{1,2})/.exec(part)?.[1],
		month: MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(part)),
		year: /\b(20\d{2})\b/.exec(part)?.[1],
	});
	const start = read(parts[0]);
	const end = read(parts[1]);
	if (!start.day || end.month < 0) return null;
	let month = start.month >= 0 ? start.month : end.month;
	let year = Number(start.year ?? end.year);
	if (!year) return null;
	// «28 DE DICIEMBRE-3 DE ENERO DE 2027»: sin año al inicio, el inicio es del año anterior.
	if (!start.year && start.month >= 0 && start.month > end.month) year -= 1;
	if (month < 0) month = end.month;
	return toISODate(new Date(Date.UTC(year, month, Number(start.day))));
}

const HEADER_RE = /<p[^>]*class="contextTtl[^"]*"[^>]*>(?:\s*<span[^>]*><\/span>)?\s*<strong>([\s\S]*?)<\/strong>/i;
const TITLE_RE = /<h1[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/h1>/i;
const SONG_RE = /CANCI[ÓO]N\s+(\d+)/g;

export function parseWatchtowerEpub(epubBytes: ArrayBuffer): WatchtowerStudy[] {
	const files = unzipSync(new Uint8Array(epubBytes));
	const decoder = new TextDecoder("utf-8");
	const out: WatchtowerStudy[] = [];
	for (const [name, data] of Object.entries(files)) {
		if (!/\.x?html$/i.test(name) || /extracted/i.test(name)) continue;
		const html = decoder.decode(data);
		const header = HEADER_RE.exec(html);
		const title = TITLE_RE.exec(html);
		if (!header || !title) continue;
		const weekStart = parseWeekHeader(header[1].replace(/<[^>]+>/g, ""));
		if (!weekStart) continue;
		const songs = [...html.matchAll(SONG_RE)].map((m) => Number(m[1]));
		const text = decodeEntities(title[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
		if (!text) continue;
		out.push({
			weekStart,
			title: text,
			openingSong: songs[0] ?? null,
			closingSong: songs.length > 1 ? songs[songs.length - 1] : null,
		});
	}
	return out.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

async function fetchWatchtowerEpub(issue: string, lang = "S"): Promise<ArrayBuffer> {
	const links = await fetch(`${MEDIA_LINKS_URL}?pub=w&issue=${issue}&fileformat=EPUB&langwritten=${lang}&output=json`, { headers: { "User-Agent": USER_AGENT } });
	if (!links.ok) throw new Error(`watchtower_unavailable_${links.status}`);
	const body = (await links.json().catch(() => null)) as { files?: Record<string, { EPUB?: { file?: { url?: string } }[] }> } | null;
	const url = body?.files?.[lang]?.EPUB?.[0]?.file?.url;
	if (!url) throw new Error("watchtower_not_published");
	const epub = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!epub.ok) throw new Error(`watchtower_download_${epub.status}`);
	return epub.arrayBuffer();
}

/** Completa, en las reuniones de fin de semana de esas semanas, el título del estudio de La Atalaya y sus dos canciones. Solo llena lo que está
 * vacío (lo escrito a mano no se pisa). Nunca falla: si la edición todavía no está publicada, no hace nada. Devuelve cuántas reuniones completó. */
export async function importWatchtowerForWeeks(db: Database, mondays: string[]): Promise<number> {
	if (mondays.length === 0) return 0;
	await ensureSongsCatalog(db);

	const studies = new Map<string, WatchtowerStudy>();
	for (const issue of new Set(mondays.map(watchtowerIssueForWeek))) {
		try {
			for (const study of parseWatchtowerEpub(await fetchWatchtowerEpub(issue))) studies.set(study.weekStart, study);
		} catch {
			// edición aún no publicada o sin conexión: se intenta de nuevo en la próxima corrida
		}
	}
	if (studies.size === 0) return 0;

	const lastSunday = toISODate(addDays(parseISODate(mondays[mondays.length - 1]), 6));
	const meetings = await db
		.select()
		.from(weekendMeetings)
		.where(and(gte(weekendMeetings.meetingDate, mondays[0]), lte(weekendMeetings.meetingDate, lastSunday)));

	let filled = 0;
	for (const monday of mondays) {
		const study = studies.get(monday);
		if (!study) continue;
		const sunday = toISODate(addDays(parseISODate(monday), 6));
		const meeting = meetings.find((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
		if (!meeting) continue;
		const patch: Partial<typeof weekendMeetings.$inferInsert> = {};
		if (!meeting.watchtowerTitle) patch.watchtowerTitle = study.title;
		if (meeting.watchtowerSongNumber == null && study.openingSong != null) patch.watchtowerSongNumber = study.openingSong;
		if (meeting.closingSongNumber == null && study.closingSong != null) patch.closingSongNumber = study.closingSong;
		if (Object.keys(patch).length === 0) continue;
		await db.update(weekendMeetings).set(patch).where(eq(weekendMeetings.id, meeting.id));
		filled++;
	}
	return filled;
}
