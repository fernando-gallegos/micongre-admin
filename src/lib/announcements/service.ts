import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { announcementViews } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { isElderOrMinisterialServant } from "@/lib/rbac/guards";
import { ANNOUNCEMENTS } from "./catalog";
import { centralAnnouncements } from "./central";
import { pendingAnnouncements, type Announcement } from "./rules";

/** Todas las novedades publicadas: las del router (para todas las instalaciones) y las que aún estén en el código; si un id está en las
 * dos, vale la del router. */
export async function publishedAnnouncements(): Promise<Announcement[]> {
	const central = await centralAnnouncements();
	const ids = new Set(central.map((a) => a.id));
	return [...ANNOUNCEMENTS.filter((a) => a.published && !ids.has(a.id)), ...central];
}

/** Novedades publicadas que le tocan a la persona y aún no ha cerrado. */
export async function pendingFor(db: Database, session: Session): Promise<Announcement[]> {
	const published = await publishedAnnouncements();
	if (published.length === 0) return [];
	const [seen, isAppointed] = await Promise.all([
		db.select({ id: announcementViews.announcementId }).from(announcementViews).where(eq(announcementViews.userId, session.userId)),
		published.some((a) => a.audience === "appointed") ? isElderOrMinisterialServant(db, session.userId) : Promise.resolve(false),
	]);
	return pendingAnnouncements(published, { isAdmin: session.role === "admin", isAppointed }, seen.map((s) => s.id));
}

/** La persona cerró la novedad: no se le vuelve a mostrar. */
export async function markSeen(db: Database, userId: string, announcementId: string): Promise<boolean> {
	if (!(await publishedAnnouncements()).some((a) => a.id === announcementId)) return false;
	await db.insert(announcementViews).values({ userId, announcementId }).onConflictDoNothing();
	return true;
}

