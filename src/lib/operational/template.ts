// Plantilla de puestos de tareas operativas: qué puestos lleva cada reunión de entre semana y de fin de semana.
// Las reuniones se ajustan a ella (agregar lo que falte, quitar lo que sobre) sin tocar nunca un puesto que ya tiene a alguien.
// Lo usan GET /api/operational (primera vez que se abre una reunión), PUT /api/operational/template y el job diario.
import { and, asc, eq, gte, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { congregations, midweekMeetings, operationalSchedules, operationalTemplateSlots, privileges, weekendMeetings } from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { mondayOf, toISODate } from "@/lib/mwb/dates";
import { NON_MEETING_OPERATIONAL_IDS } from "@/lib/rbac/roles";

export type OperationalMeetingType = "midweek" | "weekend";

export interface TemplateSlot {
	privilegeId: string;
	position: string | null;
}

export interface ExistingSlot extends TemplateSlot {
	id: string;
	meetingId: string;
	assignedUserId: string | null;
}

export interface SyncResult {
	meetings: number;
	added: number;
	removed: number;
}

export function normalizePosition(position: string | null | undefined): string | null {
	const trimmed = position?.trim();
	return trimmed ? trimmed : null;
}

const slotKey = (s: TemplateSlot) => `${s.privilegeId}|${normalizePosition(s.position) ?? ""}`;

/** Un mismo privilegio con el mismo nombre de puesto no puede repetirse (la tabla de la reunión no lo admite);
 * sin nombre sí: así se piden «2 acomodadores de entrada». Devuelve la primera clave repetida o null. */
export function findDuplicatePosition(slots: TemplateSlot[]): TemplateSlot | null {
	const seen = new Set<string>();
	for (const s of slots) {
		if (!normalizePosition(s.position)) continue;
		const k = slotKey(s);
		if (seen.has(k)) return s;
		seen.add(k);
	}
	return null;
}

/** Qué cambiar en una reunión para que coincida con la plantilla: se agregan los puestos que faltan y se quitan los que
 * sobran (o no están en la plantilla) solo si nadie los ocupa. Un puesto ocupado nunca se quita. */
export function planSlotSync(template: TemplateSlot[], existing: ExistingSlot[]): { insert: TemplateSlot[]; remove: string[] } {
	const want = new Map<string, { slot: TemplateSlot; count: number }>();
	for (const t of template) {
		const k = slotKey(t);
		const entry = want.get(k) ?? { slot: { privilegeId: t.privilegeId, position: normalizePosition(t.position) }, count: 0 };
		entry.count++;
		want.set(k, entry);
	}
	const have = new Map<string, ExistingSlot[]>();
	for (const e of existing) have.set(slotKey(e), [...(have.get(slotKey(e)) ?? []), e]);

	const insert: TemplateSlot[] = [];
	const remove: string[] = [];
	for (const [k, { slot, count }] of want) {
		const rows = have.get(k) ?? [];
		for (let i = rows.length; i < count; i++) insert.push(slot);
		if (rows.length > count) {
			const free = rows.filter((r) => !r.assignedUserId);
			remove.push(...free.slice(0, rows.length - count).map((r) => r.id));
		}
	}
	for (const [k, rows] of have) if (!want.has(k)) remove.push(...rows.filter((r) => !r.assignedUserId).map((r) => r.id));
	return { insert, remove };
}

/** Privilegios que pueden ser un puesto de reunión (los operativos, menos los de predicación y territorios). */
export async function loadOperationalCatalog(db: Database): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: privileges.id, name: privileges.name })
		.from(privileges)
		.where(and(eq(privileges.category, "operational"), notInArray(privileges.id, NON_MEETING_OPERATIONAL_IDS)))
		.orderBy(asc(privileges.name));
}

export async function isTemplateConfigured(db: Database): Promise<boolean> {
	const [row] = await db.select({ set: congregations.operationalTemplateSet }).from(congregations).limit(1);
	return !!row?.set;
}

/** Plantilla vigente de un tipo de reunión. Mientras nadie la haya configurado: un puesto por cada privilegio operativo. */
export async function loadTemplate(db: Database, meetingType: OperationalMeetingType): Promise<TemplateSlot[]> {
	if (!(await isTemplateConfigured(db))) return (await loadOperationalCatalog(db)).map((p) => ({ privilegeId: p.id, position: null }));
	return db
		.select({ privilegeId: operationalTemplateSlots.privilegeId, position: operationalTemplateSlots.position })
		.from(operationalTemplateSlots)
		.where(eq(operationalTemplateSlots.meetingType, meetingType))
		.orderBy(asc(operationalTemplateSlots.sortOrder));
}

/** Ajusta las reuniones indicadas a la plantilla (ver `planSlotSync`). */
export async function syncMeetingsToTemplate(
	db: Database,
	meetingType: OperationalMeetingType,
	meetingIds: string[],
	template?: TemplateSlot[],
): Promise<SyncResult> {
	const result: SyncResult = { meetings: meetingIds.length, added: 0, removed: 0 };
	if (meetingIds.length === 0) return result;
	const slots = template ?? (await loadTemplate(db, meetingType));

	const existing: ExistingSlot[] = [];
	for (const ids of chunked(meetingIds)) {
		existing.push(
			...(await db
				.select({
					id: operationalSchedules.id,
					meetingId: operationalSchedules.meetingId,
					privilegeId: operationalSchedules.privilegeId,
					position: operationalSchedules.position,
					assignedUserId: operationalSchedules.assignedUserId,
				})
				.from(operationalSchedules)
				.where(and(eq(operationalSchedules.meetingType, meetingType), inArray(operationalSchedules.meetingId, ids)))),
		);
	}

	const inserts: (typeof operationalSchedules.$inferInsert)[] = [];
	const removals: string[] = [];
	for (const meetingId of meetingIds) {
		const plan = planSlotSync(slots, existing.filter((e) => e.meetingId === meetingId));
		inserts.push(...plan.insert.map((s) => ({ meetingType, meetingId, privilegeId: s.privilegeId, position: s.position })));
		removals.push(...plan.remove);
	}
	// D1 admite hasta 100 parámetros por consulta: 5 columnas × 15 filas.
	for (const rows of chunked(inserts, 15)) await db.insert(operationalSchedules).values(rows);
	for (const ids of chunked(removals)) await db.delete(operationalSchedules).where(inArray(operationalSchedules.id, ids));
	result.added = inserts.length;
	result.removed = removals.length;
	return result;
}

/** Lunes de la semana en curso (hora de Nicaragua, UTC−6): desde ahí se ajustan las reuniones. */
export function currentWeekStart(now = new Date()): string {
	return toISODate(mondayOf(new Date(now.getTime() - 6 * 3_600_000)));
}

/** Ajusta a la plantilla todas las reuniones desde la semana en curso en adelante. */
export async function syncUpcomingMeetings(
	db: Database,
	fromDate: string,
	types: OperationalMeetingType[] = ["midweek", "weekend"],
): Promise<SyncResult> {
	const total: SyncResult = { meetings: 0, added: 0, removed: 0 };
	for (const type of types) {
		const table = type === "midweek" ? midweekMeetings : weekendMeetings;
		const ids = (await db.select({ id: table.id }).from(table).where(gte(table.meetingDate, fromDate))).map((m) => m.id);
		const r = await syncMeetingsToTemplate(db, type, ids);
		total.meetings += r.meetings;
		total.added += r.added;
		total.removed += r.removed;
	}
	return total;
}
