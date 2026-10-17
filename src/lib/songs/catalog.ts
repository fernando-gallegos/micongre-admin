import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { songs } from "@/db/schema";
import { parseSjjEpub, type ParsedSong } from "./parseSjj";

const MEDIA_LINKS_URL = "https://pubmedia.jw-api.org/GETPUBMEDIALINKS";
const USER_AGENT = "jwlibrary-android";

/** Descarga el EPUB del cancionero «Cantemos con gozo» (sjj) del endpoint público de medios de JW.ORG. */
export async function fetchSjjEpub(lang = "S"): Promise<ArrayBuffer> {
	const linksUrl = `${MEDIA_LINKS_URL}?pub=sjj&fileformat=EPUB&langwritten=${lang}&output=json`;
	const links = await fetch(linksUrl, { headers: { "User-Agent": USER_AGENT } });
	if (!links.ok) throw new Error(`catalog_unavailable_${links.status}`);
	const body = (await links.json().catch(() => null)) as { files?: Record<string, { EPUB?: { file?: { url?: string } }[] }> } | null;
	const url = body?.files?.[lang]?.EPUB?.[0]?.file?.url;
	if (!url) throw new Error("catalog_not_published");
	const epub = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!epub.ok) throw new Error(`catalog_download_${epub.status}`);
	return epub.arrayBuffer();
}

/** Agrega las canciones nuevas y actualiza el título de las que ya existen (el número de canción es el identificador). */
export async function upsertSongs(db: Database, parsed: ParsedSong[]): Promise<{ created: number; updated: number; total: number }> {
	const existing = new Map((await db.select().from(songs)).map((row) => [row.number, row.title]));
	let created = 0;
	let updated = 0;
	for (const song of parsed) {
		const current = existing.get(song.number);
		if (current === undefined) {
			await db.insert(songs).values(song);
			created++;
		} else if (current !== song.title) {
			await db.update(songs).set({ title: song.title }).where(eq(songs.number, song.number));
			updated++;
		}
	}
	return { created, updated, total: parsed.length };
}

/** Si el catálogo de canciones está vacío, lo baja de JW.ORG (lo usan el importador de reuniones y el job diario).
 * Nunca falla: sin catálogo, las reuniones se guardan igual con el número de canción. */
export async function ensureSongsCatalog(db: Database): Promise<void> {
	try {
		const [any] = await db.select({ number: songs.number }).from(songs).limit(1);
		if (any) return;
		const parsed = parseSjjEpub(await fetchSjjEpub());
		if (parsed.length > 0) await upsertSongs(db, parsed);
	} catch {
		// se puede importar a mano desde Historial
	}
}

/** número → título, para mostrar «Canción 65: título». */
export async function songTitleMap(db: Database): Promise<Map<number, string>> {
	return new Map((await db.select().from(songs)).map((row) => [row.number, row.title]));
}

export { songLabel } from "./label";
