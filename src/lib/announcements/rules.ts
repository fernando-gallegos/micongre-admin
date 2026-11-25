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
	intro?: string;
	items: AnnouncementItem[];
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
