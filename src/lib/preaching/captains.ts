// Predicación, flujo 2 («capitán fijo por día»): cada día de la semana y tipo de territorio puede tener uno o varios capitanes fijos.
// Al programar una salida ese día se elige el capitán (por omisión, el fijo; o un suplente solo para esa fecha) y solo el territorio:
// al guardar, el territorio se le asigna y se devuelven todos los que tenía pendientes (y la asignación anterior de ese territorio, si
// era de otra persona). Los días sin capitán fijo siguen con el flujo 1 (el territorio ya viene asignado). Puede haber de los dos.
import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { preachingDayCaptains, users } from "@/db/schema";
import { listAssignableUsers } from "@/lib/territories/service";

export type CaptainKind = "general" | "public_preaching";

export interface DayCaptain {
	weekday: number;
	kind: CaptainKind;
	userId: string;
	fullName: string;
}

/** Día de la semana de una fecha AAAA-MM-DD: 1 = lunes … 7 = domingo. */
export function weekdayOf(date: string): number {
	const day = new Date(`${date}T12:00:00Z`).getUTCDay();
	return day === 0 ? 7 : day;
}

/** Los capitanes fijos de esa fecha (de cualquier tipo, o de uno), en su orden. Vacío = ese día va con el flujo 1. */
export function captainsForDate<T extends Pick<DayCaptain, "weekday" | "kind">>(captains: T[], date: string, kind?: CaptainKind): T[] {
	const weekday = weekdayOf(date);
	return captains.filter((c) => c.weekday === weekday && (!kind || c.kind === kind));
}

export async function listDayCaptains(db: Database): Promise<DayCaptain[]> {
	return db
		.select({ weekday: preachingDayCaptains.weekday, kind: preachingDayCaptains.kind, userId: preachingDayCaptains.userId, fullName: users.fullName })
		.from(preachingDayCaptains)
		.innerJoin(users, eq(users.id, preachingDayCaptains.userId))
		.orderBy(asc(preachingDayCaptains.weekday), asc(preachingDayCaptains.kind), asc(preachingDayCaptains.sortOrder));
}

export class CaptainsFailure extends Error {}

/** Reemplaza todos los capitanes fijos. Cada uno debe poder recibir territorios de ese tipo («Asignable para territorio» o «… para
 * predicación pública»). */
export async function saveDayCaptains(db: Database, entries: { weekday: number; kind: CaptainKind; userIds: string[] }[]): Promise<void> {
	const allowed = {
		general: new Set((await listAssignableUsers(db, "general")).map((u) => u.id)),
		public_preaching: new Set((await listAssignableUsers(db, "public_preaching")).map((u) => u.id)),
	};
	const rows: (typeof preachingDayCaptains.$inferInsert)[] = [];
	for (const e of entries) {
		if (!Number.isInteger(e.weekday) || e.weekday < 1 || e.weekday > 7) throw new CaptainsFailure("invalid_weekday");
		[...new Set(e.userIds)].forEach((userId, i) => {
			if (!allowed[e.kind].has(userId)) throw new CaptainsFailure("captain_not_assignable");
			rows.push({ weekday: e.weekday, kind: e.kind, userId, sortOrder: i });
		});
	}
	await db.batch([
		db.delete(preachingDayCaptains),
		...Array.from({ length: Math.ceil(rows.length / 20) }, (_, i) => db.insert(preachingDayCaptains).values(rows.slice(i * 20, i * 20 + 20))),
	] as unknown as Parameters<typeof db.batch>[0]);
}
