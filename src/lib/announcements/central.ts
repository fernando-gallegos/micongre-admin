// Novedades centrales: el router (micongre-router) guarda las novedades publicadas para TODAS las instalaciones (se publican con
// `npm run novedades` en el router, sin desplegar). Cada instalación las lee con su clave de relay (`PUSH_RELAY_URL`/`PUSH_RELAY_KEY`)
// y las guarda unos minutos en memoria. Las imágenes se sirven a la web y a la app por `/api/announcements/image/<nombre>`.
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { Announcement } from "./rules";

const LIST_PATH = "/__router/catalog/announcements";
const IMAGE_PATH = "/__router/catalog/announcement-images/";
const TTL_MS = 5 * 60 * 1000;

export const IMAGE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp)$/i;

const listSchema = z.object({
	announcements: z.array(
		z.object({
			id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/),
			audience: z.enum(["all", "appointed", "admins"]),
			title: z.string().min(1).max(120),
			image: z.string().regex(IMAGE_NAME).nullable().optional(),
			intro: z.string().max(300).nullable().optional(),
			body: z.string().max(8000).nullable().optional(),
			items: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
		}),
	),
});

type Env = { PUSH_RELAY_URL?: string; PUSH_RELAY_KEY?: string };

function routerUrl(path: string, env: Env): string | null {
	if (!env.PUSH_RELAY_URL?.startsWith("https://") || !env.PUSH_RELAY_KEY) return null;
	return new URL(path, env.PUSH_RELAY_URL).toString();
}

let cache: { at: number; items: Announcement[] } | null = null;

/** Las novedades publicadas en el router (con su imagen ya como ruta de esta instalación). Sin relay o si falla: la última que tenía. */
export async function centralAnnouncements(env: Env = getEnv()): Promise<Announcement[]> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
	const url = routerUrl(LIST_PATH, env);
	if (!url) return [];
	try {
		const response = await fetch(url, { headers: { Authorization: `Bearer ${env.PUSH_RELAY_KEY}` } });
		if (!response.ok) throw new Error(`announcements_${response.status}`);
		const parsed = listSchema.parse(await response.json());
		const items: Announcement[] = parsed.announcements.map((a) => ({
			id: a.id,
			audience: a.audience,
			published: true,
			title: a.title,
			image: a.image ? `/api/announcements/image/${encodeURIComponent(a.image)}` : undefined,
			intro: a.intro ?? undefined,
			body: a.body ?? undefined,
			items: a.items ?? [],
		}));
		cache = { at: Date.now(), items };
		return items;
	} catch (error) {
		console.error("central_announcements_failed", error);
		return cache?.items ?? [];
	}
}

/** La imagen de una novedad central, tal como la guarda el router; null si no existe o no hay relay. */
export async function centralAnnouncementImage(name: string, env: Env = getEnv()): Promise<Response | null> {
	if (!IMAGE_NAME.test(name)) return null;
	const url = routerUrl(`${IMAGE_PATH}${encodeURIComponent(name)}`, env);
	if (!url) return null;
	const response = await fetch(url, { headers: { Authorization: `Bearer ${env.PUSH_RELAY_KEY}` } });
	return response.ok ? response : null;
}
