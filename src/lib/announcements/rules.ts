// Novedades («¿Qué hay de nuevo?»): a quién le toca cada una. Puro, con pruebas.

/** 1 = todos, 2 = ancianos y siervos ministeriales, 3 = solo administradores. */
export type AnnouncementAudience = "all" | "appointed" | "admins";

export interface AnnouncementItem {
	title: string;
	text: string;
}

export interface Announcement {
	/** Fijo y único: con él se recuerda quién ya la vio. Nunca se reutiliza. */
	id: string;
	audience: AnnouncementAudience;
	/** Solo las publicadas se muestran; las demás esperan a que se publiquen. */
	published: boolean;
	title: string;
	/**
	 * Imagen de arriba, a todo el ancho y 200 px de alto (se recorta para llenar, sin deformarse): ruta dentro de `public/`, p. ej.
	 * «/announcements/2026-11-planificadores.jpg». Recomendado 1200 × 600 px; lo importante dentro del centro (1000 × 460 px).
	 */
	image?: string;
	intro?: string;
	/** Texto en Markdown sencillo (el de los avisos): **negrita**, *cursiva*, ## títulos, listas con «- » y [enlaces](https://…). */
	body?: string;
	items?: AnnouncementItem[];
}

export interface Viewer {
	isAdmin: boolean;
	/** Anciano o siervo ministerial con nombramiento vigente. */
	isAppointed: boolean;
}

export function isForViewer(a: Announcement, viewer: Viewer): boolean {
	if (a.audience === "all") return true;
	if (a.audience === "appointed") return viewer.isAppointed;
	return viewer.isAdmin;
}

/** Las novedades publicadas que le tocan y que aún no ha visto, en el orden del catálogo. */
export function pendingAnnouncements(catalog: Announcement[], viewer: Viewer, seen: Iterable<string>): Announcement[] {
	const done = new Set(seen);
	return catalog.filter((a) => a.published && !done.has(a.id) && isForViewer(a, viewer));
}
