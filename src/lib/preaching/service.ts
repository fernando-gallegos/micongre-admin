import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	fieldServiceGroups,
	notificationRecipients,
	notifications,
	preachingSessionTargets,
	preachingSessionTerritories,
	preachingSessions,
	territories,
	territoryAssignments,
	users,
} from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { formatLongDate } from "@/lib/dateFormat";
import { time12 } from "@/lib/export/builders/meetingDates";
import { sendPushes } from "@/lib/push/dispatch";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

export type PreachingError =
	| "not_found"
	| "invalid_date"
	| "invalid_time"
	| "no_territories"
	| "territory_not_assigned"
	| "mixed_kinds"
	| "invalid_targets";

export class PreachingFailure extends Error {
	constructor(public code: PreachingError) {
		super(code);
	}
}

export interface SessionInput {
	date: string;
	time: string;
	note: string | null;
	territoryIds: string[];
	/** Territorios generales: toda la congregación o grupos. Predicación pública: publicadores. */
	targets: { congregation: boolean; groupIds: string[]; userIds: string[] };
}

export interface SessionView {
	id: string;
	date: string;
	time: string;
	note: string | null;
	kind: "general" | "public_preaching";
	notifiedAt: string | null;
	/** `assigneeName`: quien tiene el territorio asignado ahora (para el widget de predicación de la app). */
	territories: { id: string; number: string; name: string | null; assigneeName: string | null }[];
	targets: { congregation: boolean; groups: { id: string; name: string; color: string | null }[]; users: { id: string; fullName: string }[] };
}

/** Territorios con asignación vigente: los únicos sobre los que se puede programar una predicación. */
export async function listAssignableTerritories(db: Database) {
	return db
		.select({
			id: territories.id,
			number: territories.number,
			name: territories.name,
			kind: territories.kind,
			assigneeName: users.fullName,
		})
		.from(territoryAssignments)
		.innerJoin(territories, eq(territories.id, territoryAssignments.territoryId))
		.innerJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
		.where(eq(territoryAssignments.status, "assigned"))
		.orderBy(asc(territories.number));
}

/** Personas a las que se puede asignar una predicación pública (activas con acceso, sin el administrador oculto ni sacados). */
export async function listAssignablePeople(db: Database) {
	return db
		.select({ id: users.id, fullName: users.fullName })
		.from(users)
		.where(and(eq(users.accountStatus, "active"), eq(users.active, true), notHiddenAdmin))
		.orderBy(asc(users.fullName));
}

export async function listSessions(db: Database): Promise<SessionView[]> {
	const sessions = await db.select().from(preachingSessions).orderBy(desc(preachingSessions.sessionDate), desc(preachingSessions.sessionTime));
	if (sessions.length === 0) return [];
	const ids = sessions.map((s) => s.id);

	const territoryRows = (
		await Promise.all(
			chunked(ids).map((part) =>
				db
					.select({ sessionId: preachingSessionTerritories.sessionId, id: territories.id, number: territories.number, name: territories.name, assigneeName: users.fullName })
					.from(preachingSessionTerritories)
					.innerJoin(territories, eq(territories.id, preachingSessionTerritories.territoryId))
					.leftJoin(territoryAssignments, and(eq(territoryAssignments.territoryId, territories.id), eq(territoryAssignments.status, "assigned")))
					.leftJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
					.where(inArray(preachingSessionTerritories.sessionId, part)),
			),
		)
	).flat();
	const targetRows = (
		await Promise.all(
			chunked(ids).map((part) =>
				db
					.select({
						sessionId: preachingSessionTargets.sessionId,
						type: preachingSessionTargets.targetType,
						groupId: preachingSessionTargets.groupId,
						groupName: fieldServiceGroups.name,
						groupColor: fieldServiceGroups.color,
						userId: preachingSessionTargets.userId,
						userName: users.fullName,
					})
					.from(preachingSessionTargets)
					.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, preachingSessionTargets.groupId))
					.leftJoin(users, eq(users.id, preachingSessionTargets.userId))
					.where(inArray(preachingSessionTargets.sessionId, part)),
			),
		)
	).flat();

	return sessions.map((s) => {
		const mine = targetRows.filter((t) => t.sessionId === s.id);
		return {
			id: s.id,
			date: s.sessionDate,
			time: s.sessionTime,
			note: s.note,
			kind: s.kind,
			notifiedAt: s.notifiedAt ? s.notifiedAt.toISOString() : null,
			territories: territoryRows
				.filter((t) => t.sessionId === s.id)
				.map(({ id, number, name, assigneeName }) => ({ id, number, name, assigneeName: assigneeName ?? null }))
				.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
			targets: {
				congregation: mine.some((t) => t.type === "congregation"),
				groups: mine.filter((t) => t.type === "group" && t.groupId).map((t) => ({ id: t.groupId!, name: t.groupName ?? "Grupo", color: t.groupColor })),
				users: mine.filter((t) => t.type === "publisher" && t.userId).map((t) => ({ id: t.userId!, fullName: t.userName ?? "" })),
			},
		};
	});
}

/** Salidas de un mes (AAAA-MM) para el calendario: quien administra el módulo ve todas; las demás personas, solo las que les
 * tocan (a toda la congregación, a su grupo o a ellas). */
export async function listSessionsForCalendar(
	db: Database,
	userId: string,
	opts: { month: string; all: boolean },
): Promise<SessionView[]> {
	const sessions = (await listSessions(db)).filter((s) => s.date.startsWith(opts.month));
	if (opts.all) return sessions;
	const [me] = await db.select({ groupId: users.fieldServiceGroupId }).from(users).where(eq(users.id, userId)).limit(1);
	return sessions.filter(
		(s) =>
			s.targets.congregation ||
			s.targets.users.some((u) => u.id === userId) ||
			(!!me?.groupId && s.targets.groups.some((g) => g.id === me.groupId)),
	);
}

/** Valida la salida y devuelve el tipo de sus territorios. Lanza PreachingFailure con el motivo. */
async function validate(db: Database, input: SessionInput): Promise<"general" | "public_preaching"> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new PreachingFailure("invalid_date");
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new PreachingFailure("invalid_time");

	const territoryIds = [...new Set(input.territoryIds)];
	if (territoryIds.length === 0) throw new PreachingFailure("no_territories");
	const rows = await db
		.select({ id: territories.id, kind: territories.kind })
		.from(territories)
		.innerJoin(territoryAssignments, and(eq(territoryAssignments.territoryId, territories.id), eq(territoryAssignments.status, "assigned")))
		.where(inArray(territories.id, territoryIds));
	// Todos deben existir y tener asignación vigente.
	if (new Set(rows.map((r) => r.id)).size !== territoryIds.length) throw new PreachingFailure("territory_not_assigned");
	const kinds = new Set(rows.map((r) => r.kind));
	if (kinds.size > 1) throw new PreachingFailure("mixed_kinds");
	const kind = rows[0].kind;

	const { congregation, groupIds, userIds } = input.targets;
	if (kind === "general") {
		// Toda la congregación o grupos (uno o varios), nunca publicadores sueltos.
		if (userIds.length > 0) throw new PreachingFailure("invalid_targets");
		if (congregation === (groupIds.length > 0)) throw new PreachingFailure("invalid_targets");
		if (groupIds.length > 0) {
			const found = await db
				.select({ id: fieldServiceGroups.id })
				.from(fieldServiceGroups)
				.where(and(inArray(fieldServiceGroups.id, groupIds), eq(fieldServiceGroups.active, true)));
			if (found.length !== new Set(groupIds).size) throw new PreachingFailure("invalid_targets");
		}
	} else {
		// Predicación pública: solo publicadores (varios).
		if (congregation || groupIds.length > 0 || userIds.length === 0) throw new PreachingFailure("invalid_targets");
		const found = (
			await Promise.all(chunked([...new Set(userIds)]).map((part) => db.select({ id: users.id }).from(users).where(and(inArray(users.id, part), notHiddenAdmin))))
		).flat();
		if (found.length !== new Set(userIds).size) throw new PreachingFailure("invalid_targets");
	}
	return kind;
}

async function writeChildren(db: Database, sessionId: string, input: SessionInput) {
	await db.delete(preachingSessionTerritories).where(eq(preachingSessionTerritories.sessionId, sessionId));
	await db.delete(preachingSessionTargets).where(eq(preachingSessionTargets.sessionId, sessionId));
	for (const part of chunked([...new Set(input.territoryIds)], 40)) {
		await db.insert(preachingSessionTerritories).values(part.map((territoryId) => ({ sessionId, territoryId })));
	}
	const targets: (typeof preachingSessionTargets.$inferInsert)[] = input.targets.congregation
		? [{ sessionId, targetType: "congregation" as const }]
		: [
				...[...new Set(input.targets.groupIds)].map((groupId) => ({ sessionId, targetType: "group" as const, groupId })),
				...[...new Set(input.targets.userIds)].map((userId) => ({ sessionId, targetType: "publisher" as const, userId })),
			];
	for (const part of chunked(targets, 20)) await db.insert(preachingSessionTargets).values(part);
}

export async function createSession(db: Database, input: SessionInput, actorId: string): Promise<string> {
	const kind = await validate(db, input);
	const id = crypto.randomUUID();
	await db.insert(preachingSessions).values({ id, sessionDate: input.date, sessionTime: input.time, note: input.note, kind, createdByUserId: actorId });
	await writeChildren(db, id, input);
	await publishNotices(db, id, actorId);
	return id;
}

export async function updateSession(db: Database, id: string, input: SessionInput, actorId: string): Promise<void> {
	const [existing] = await db.select({ id: preachingSessions.id }).from(preachingSessions).where(eq(preachingSessions.id, id)).limit(1);
	if (!existing) throw new PreachingFailure("not_found");
	const kind = await validate(db, input);
	await db
		.update(preachingSessions)
		.set({ sessionDate: input.date, sessionTime: input.time, note: input.note, kind, updatedAt: new Date() })
		.where(eq(preachingSessions.id, id));
	await writeChildren(db, id, input);
	await publishNotices(db, id, actorId);
}

export async function deleteSession(db: Database, id: string): Promise<void> {
	const [row] = await db.select({ notificationIds: preachingSessions.notificationIds }).from(preachingSessions).where(eq(preachingSessions.id, id)).limit(1);
	if (!row) throw new PreachingFailure("not_found");
	await retract(db, row.notificationIds);
	await db.delete(preachingSessions).where(eq(preachingSessions.id, id));
}

async function retract(db: Database, notificationIds: string | null) {
	const ids = notificationIds ? (JSON.parse(notificationIds) as string[]) : [];
	for (const part of chunked(ids)) await db.delete(notifications).where(inArray(notifications.id, part));
}

/** Genera los avisos de la salida (feed de Mi Panel + push) para quien corresponde: toda la congregación, los integrantes de
 * los grupos o los publicadores elegidos. Reemplaza los avisos anteriores de la misma salida. */
export async function publishNotices(db: Database, sessionId: string, actorId: string): Promise<void> {
	const [session] = await db.select().from(preachingSessions).where(eq(preachingSessions.id, sessionId)).limit(1);
	if (!session) throw new PreachingFailure("not_found");
	await retract(db, session.notificationIds);

	const [view] = (await listSessions(db)).filter((s) => s.id === sessionId);
	const territoryText = view.territories.map((t) => (t.name ? `${t.number} — ${t.name}` : t.number)).join(", ");
	const title = `Predicación — ${formatLongDate(view.date)}, ${time12(view.time)}`;
	const message = `**${title}**\n${view.territories.length === 1 ? "Territorio" : "Territorios"}: ${territoryText}${view.note ? `\n${view.note}` : ""}`;

	const everyone = await db
		.select({ id: users.id, groupId: users.fieldServiceGroupId })
		.from(users)
		.where(and(eq(users.accountStatus, "active"), eq(users.active, true), notHiddenAdmin));

	const createdIds: string[] = [];
	let pushUserIds: string[] = [];
	const insertNotice = async (scope: "congregation" | "group" | "publisher", groupId?: string) => {
		const [row] = await db
			.insert(notifications)
			.values({ senderUserId: actorId, scope, groupId: groupId ?? null, message, expiresAt: view.date })
			.returning({ id: notifications.id });
		createdIds.push(row.id);
		return row.id;
	};

	if (view.targets.congregation) {
		await insertNotice("congregation");
		pushUserIds = everyone.map((u) => u.id);
	} else if (view.targets.groups.length > 0) {
		for (const group of view.targets.groups) {
			await insertNotice("group", group.id);
			pushUserIds.push(...everyone.filter((u) => u.groupId === group.id).map((u) => u.id));
		}
	} else if (view.targets.users.length > 0) {
		const noticeId = await insertNotice("publisher");
		for (const part of chunked(view.targets.users, 40)) {
			await db.insert(notificationRecipients).values(part.map((u) => ({ notificationId: noticeId, userId: u.id })));
		}
		pushUserIds = view.targets.users.map((u) => u.id);
	}

	await db
		.update(preachingSessions)
		.set({ notificationIds: JSON.stringify(createdIds), notifiedAt: new Date() })
		.where(eq(preachingSessions.id, sessionId));

	const payload = { title, body: `${view.territories.length === 1 ? "Territorio" : "Territorios"} ${territoryText}${view.note ? ` · ${view.note}` : ""}`.slice(0, 220), url: "/panel" };
	await sendPushes(
		db,
		[...new Set(pushUserIds)].map((userId) => ({ userId, payload })),
	);
}
