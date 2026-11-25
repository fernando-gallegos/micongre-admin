// Predicación recurrente: una salida marcada «Recurrente» se repite cada semana el mismo día, a la misma hora, con los mismos
// territorios y destinatarios, mientras cada territorio siga con la misma asignación (el mismo capitán) que tenía al
// programarla. Cuando el capitán lo entrega (completado o devuelto) o se le asigna a otro, ese territorio sale de la serie;
// sin territorios, la serie termina. La marca la lleva solo la salida más reciente: al crear la siguiente, pasa a ella.
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { preachingSessionTargets, preachingSessionTerritories, preachingSessions, territoryAssignments } from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { deleteSession, publishNotices } from "./service";

export interface RecurringResult {
	created: number;
	ended: number;
	removed: number;
}

/** Fecha de la siguiente salida: la misma semana tras semana, la primera después de hoy. */
export function nextRecurringDate(date: string, today: string): string {
	let next = parseISODate(date);
	do next = addDays(next, 7);
	while (toISODate(next) <= today);
	return toISODate(next);
}

/** Territorios de la salida que siguen con la misma asignación vigente que cuando se programó. */
export function keptTerritories(
	rows: { territoryId: string; assignmentId: string | null }[],
	current: Map<string, string>,
): { territoryId: string; assignmentId: string }[] {
	return rows
		.filter((r) => r.assignmentId && current.get(r.territoryId) === r.assignmentId)
		.map((r) => ({ territoryId: r.territoryId, assignmentId: r.assignmentId as string }));
}

/** Hoy en Nicaragua (UTC−6), AAAA-MM-DD. */
export function nicaraguaToday(now = new Date()): string {
	return toISODate(new Date(now.getTime() - 6 * 3_600_000));
}

/** Revisa las series recurrentes. Siempre quita de la salida pendiente los territorios que ya se entregaron o cambiaron de
 * capitán (y la borra si no le queda ninguno). Con `generate`, a partir del día de la salida crea la de la semana siguiente
 * (con sus avisos) y le pasa la marca. Lo corren el job diario (con `generate`) y la entrega de un territorio (sin él). */
export async function runRecurringPreaching(db: Database, today: string, { generate }: { generate: boolean }): Promise<RecurringResult> {
	const result: RecurringResult = { created: 0, ended: 0, removed: 0 };
	const heads = await db.select().from(preachingSessions).where(eq(preachingSessions.recurring, true));
	if (heads.length === 0) return result;

	const headIds = heads.map((h) => h.id);
	const territoryRows = (
		await Promise.all(
			chunked(headIds).map((part) =>
				db
					.select({
						sessionId: preachingSessionTerritories.sessionId,
						territoryId: preachingSessionTerritories.territoryId,
						assignmentId: preachingSessionTerritories.assignmentId,
						departureFid: preachingSessionTerritories.departureFid,
					})
					.from(preachingSessionTerritories)
					.where(inArray(preachingSessionTerritories.sessionId, part)),
			),
		)
	).flat();
	const territoryIds = [...new Set(territoryRows.map((r) => r.territoryId))];
	const current = new Map<string, string>();
	for (const part of chunked(territoryIds)) {
		const rows = await db
			.select({ territoryId: territoryAssignments.territoryId, id: territoryAssignments.id })
			.from(territoryAssignments)
			.where(and(inArray(territoryAssignments.territoryId, part), eq(territoryAssignments.status, "assigned")));
		for (const r of rows) current.set(r.territoryId, r.id);
	}

	for (const head of heads) {
		const mine = territoryRows.filter((r) => r.sessionId === head.id);
		const kept = keptTerritories(mine, current);
		const upcoming = head.sessionDate > today;

		if (kept.length < mine.length && upcoming) {
			// Salida aún por hacer: se quitan los territorios entregados; sin ninguno, se borra (con sus avisos).
			if (kept.length === 0) {
				await deleteSession(db, head.id);
				result.removed++;
				continue;
			}
			const keep = new Set(kept.map((k) => k.territoryId));
			const drop = mine.filter((r) => !keep.has(r.territoryId)).map((r) => r.territoryId);
			for (const part of chunked(drop)) {
				await db
					.delete(preachingSessionTerritories)
					.where(and(eq(preachingSessionTerritories.sessionId, head.id), inArray(preachingSessionTerritories.territoryId, part)));
			}
			await publishNotices(db, head.id, head.createdByUserId);
		}

		if (kept.length === 0) {
			if (!upcoming) {
				await db.update(preachingSessions).set({ recurring: false }).where(eq(preachingSessions.id, head.id));
				result.ended++;
			}
			continue;
		}
		if (!generate || upcoming) continue;

		// El día de la salida (o después) se crea la de la semana siguiente y la marca pasa a ella.
		const id = crypto.randomUUID();
		await db.insert(preachingSessions).values({
			id,
			sessionDate: nextRecurringDate(head.sessionDate, today),
			sessionTime: head.sessionTime,
			note: head.note,
			kind: head.kind,
			recurring: true,
			captainUserId: head.captainUserId,
			createdByUserId: head.createdByUserId,
		});
		for (const part of chunked(kept, 30)) {
			// La siguiente salida de la serie usa el mismo punto de salida que esta.
			await db.insert(preachingSessionTerritories).values(
				part.map((k) => ({
					sessionId: id,
					territoryId: k.territoryId,
					assignmentId: k.assignmentId,
					departureFid: mine.find((r) => r.territoryId === k.territoryId)?.departureFid ?? null,
				})),
			);
		}
		const targets = await db
			.select({ targetType: preachingSessionTargets.targetType, groupId: preachingSessionTargets.groupId, userId: preachingSessionTargets.userId })
			.from(preachingSessionTargets)
			.where(eq(preachingSessionTargets.sessionId, head.id));
		for (const part of chunked(targets, 20)) await db.insert(preachingSessionTargets).values(part.map((t) => ({ ...t, sessionId: id })));
		await db.update(preachingSessions).set({ recurring: false }).where(eq(preachingSessions.id, head.id));
		await publishNotices(db, id, head.createdByUserId);
		result.created++;
	}
	return result;
}
