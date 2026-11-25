import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import { nicaraguaNow } from "@/lib/panel/upcoming";
import { departureText, listDepartures, parseMapData, resolveDeparture, type Departure } from "@/lib/territories/geo";
import { canChangeDepartureAt } from "./departureRules";
import { assignTerritoriesToCaptain, listAssignableUsers, pruneRecurringPreaching, TerritoryFailure } from "@/lib/territories/service";

export type PreachingError =
	| "not_found"
	| "invalid_date"
	| "invalid_time"
	| "no_territories"
	| "territory_not_assigned"
	| "mixed_kinds"
	| "invalid_targets"
	| "invalid_departure"
	| "departure_locked"
	| "captain_invalid";

export class PreachingFailure extends Error {
	constructor(public code: PreachingError) {
		super(code);
	}
}

export interface SessionInput {
	date: string;
	time: string;
	note: string | null;
	/** Se repite cada semana mientras los territorios sigan con el mismo capitán. */
	recurring: boolean;
	territoryIds: string[];
	/** Punto de salida elegido por territorio (`fid`); sin valor = el que ya tenía (o el predeterminado). */
	departures?: Record<string, string | null>;
	/** Territorios generales: toda la congregación o grupos. Predicación pública: publicadores. */
	targets: { congregation: boolean; groupIds: string[]; userIds: string[] };
	/** Flujo 2 («capitán fijo por día»): el capitán de la salida; al guardar, el territorio se le asigna (ver captains.ts). */
	captainUserId?: string | null;
}

export interface SessionView {
	id: string;
	date: string;
	time: string;
	note: string | null;
	kind: "general" | "public_preaching";
	recurring: boolean;
	/** Flujo 2: el capitán de la salida (null = flujo 1). */
	captainUserId: string | null;
	notifiedAt: string | null;
	/** `assigneeName`: quien tiene el territorio asignado ahora (el capitán; para el widget de predicación de la app).
	 * `meetingPlace`: las indicaciones del territorio. `departure`: el punto de salida de ese día (el elegido o el predeterminado);
	 * `departures`: los puntos del territorio para elegir. */
	territories: SessionTerritory[];
	targets: { congregation: boolean; groups: { id: string; name: string; color: string | null }[]; users: { id: string; fullName: string }[] };
}

export interface SessionTerritory {
	id: string;
	number: string;
	name: string | null;
	meetingPlace: string | null;
	hasMap: boolean;
	assigneeName: string | null;
	assigneeUserId: string | null;
	departureFid: string | null;
	departure: Departure | null;
	departures: Departure[];
}

/** Puntos de salida de cada territorio (se lee el dibujo una vez por territorio). */
export async function loadDepartures(db: Database, territoryIds: string[]): Promise<Map<string, Departure[]>> {
	const out = new Map<string, Departure[]>();
	for (const part of chunked([...new Set(territoryIds)])) {
		const rows = await db.select({ id: territories.id, mapData: territories.mapData }).from(territories).where(inArray(territories.id, part));
		for (const r of rows) out.set(r.id, listDepartures(parseMapData(r.mapData)));
	}
	return out;
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

/** Personas a las que se puede asignar una predicación pública: quienes tienen el privilegio «Asignable para predicación pública». */
export async function listAssignablePeople(db: Database) {
	return listAssignableUsers(db, "public_preaching");
}

export async function listSessions(db: Database): Promise<SessionView[]> {
	const sessions = await db.select().from(preachingSessions).orderBy(desc(preachingSessions.sessionDate), desc(preachingSessions.sessionTime));
	if (sessions.length === 0) return [];
	const ids = sessions.map((s) => s.id);

	const territoryRows = (
		await Promise.all(
			chunked(ids).map((part) =>
				db
					.select({
						sessionId: preachingSessionTerritories.sessionId,
						id: territories.id,
						number: territories.number,
						name: territories.name,
						meetingPlace: territories.meetingPlace,
						hasMap: sql<number>`(${territories.mapData} is not null)`,
						assigneeName: users.fullName,
						assigneeUserId: users.id,
						departureFid: preachingSessionTerritories.departureFid,
					})
					.from(preachingSessionTerritories)
					.innerJoin(territories, eq(territories.id, preachingSessionTerritories.territoryId))
					.leftJoin(territoryAssignments, and(eq(territoryAssignments.territoryId, territories.id), eq(territoryAssignments.status, "assigned")))
					.leftJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
					.where(inArray(preachingSessionTerritories.sessionId, part)),
			),
		)
	).flat();
	const departuresOf = await loadDepartures(
		db,
		territoryRows.map((t) => t.id),
	);
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
			recurring: s.recurring,
			captainUserId: s.captainUserId,
			notifiedAt: s.notifiedAt ? s.notifiedAt.toISOString() : null,
			territories: territoryRows
				.filter((t) => t.sessionId === s.id)
				.map(({ id, number, name, meetingPlace, hasMap, assigneeName, assigneeUserId, departureFid }) => {
					const departures = departuresOf.get(id) ?? [];
					return {
						id,
						number,
						name,
						meetingPlace,
						hasMap: !!hasMap,
						assigneeName: assigneeName ?? null,
						assigneeUserId: assigneeUserId ?? null,
						departureFid,
						departure: resolveDeparture(departures, departureFid),
						departures,
					};
				})
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
			s.territories.some((t) => t.assigneeUserId === userId) ||
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
		// Predicación pública: solo quienes tienen el privilegio «Asignable para predicación pública».
		if (congregation || groupIds.length > 0 || userIds.length === 0) throw new PreachingFailure("invalid_targets");
		const allowed = new Set((await listAssignablePeople(db)).map((u) => u.id));
		if (![...new Set(userIds)].every((id) => allowed.has(id))) throw new PreachingFailure("invalid_targets");
	}
	return kind;
}

async function writeChildren(db: Database, sessionId: string, input: SessionInput) {
	// El punto de salida elegido antes se conserva si esta vez no se manda.
	const previous = await db
		.select({ territoryId: preachingSessionTerritories.territoryId, departureFid: preachingSessionTerritories.departureFid })
		.from(preachingSessionTerritories)
		.where(eq(preachingSessionTerritories.sessionId, sessionId));
	const previousFid = new Map(previous.map((p) => [p.territoryId, p.departureFid]));
	await db.delete(preachingSessionTerritories).where(eq(preachingSessionTerritories.sessionId, sessionId));
	await db.delete(preachingSessionTargets).where(eq(preachingSessionTargets.sessionId, sessionId));
	// Se guarda la asignación vigente (el capitán) de cada territorio: la recurrencia sigue solo mientras sea la misma.
	const territoryIds = [...new Set(input.territoryIds)];
	const current = (
		await Promise.all(
			chunked(territoryIds).map((part) =>
				db
					.select({ territoryId: territoryAssignments.territoryId, id: territoryAssignments.id })
					.from(territoryAssignments)
					.where(and(inArray(territoryAssignments.territoryId, part), eq(territoryAssignments.status, "assigned"))),
			),
		)
	).flat();
	const assignmentOf = new Map(current.map((a) => [a.territoryId, a.id]));
	for (const part of chunked(territoryIds, 30)) {
		await db
			.insert(preachingSessionTerritories)
			.values(
				part.map((territoryId) => ({
					sessionId,
					territoryId,
					assignmentId: assignmentOf.get(territoryId) ?? null,
					departureFid: input.departures && territoryId in input.departures ? (input.departures[territoryId] ?? null) : (previousFid.get(territoryId) ?? null),
				})),
			);
	}
	const targets: (typeof preachingSessionTargets.$inferInsert)[] = input.targets.congregation
		? [{ sessionId, targetType: "congregation" as const }]
		: [
				...[...new Set(input.targets.groupIds)].map((groupId) => ({ sessionId, targetType: "group" as const, groupId })),
				...[...new Set(input.targets.userIds)].map((userId) => ({ sessionId, targetType: "publisher" as const, userId })),
			];
	for (const part of chunked(targets, 20)) await db.insert(preachingSessionTargets).values(part);
}

/** Flujo 2: antes de validar, el territorio pasa al capitán (y se devuelven los que tenía). */
async function assignToCaptain(db: Database, input: SessionInput, actorId: string) {
	if (!input.captainUserId) return;
	try {
		await assignTerritoriesToCaptain(db, [...new Set(input.territoryIds)], input.captainUserId, actorId);
	} catch (error) {
		if (error instanceof TerritoryFailure) throw new PreachingFailure(error.code === "territory_not_found" ? "territory_not_assigned" : "captain_invalid");
		throw error;
	}
}

export async function createSession(db: Database, input: SessionInput, actorId: string): Promise<string> {
	await assignToCaptain(db, input, actorId);
	const kind = await validate(db, input);
	const id = crypto.randomUUID();
	await db.insert(preachingSessions).values({
		id,
		sessionDate: input.date,
		sessionTime: input.time,
		note: input.note,
		kind,
		recurring: input.recurring,
		captainUserId: input.captainUserId ?? null,
		createdByUserId: actorId,
	});
	await writeChildren(db, id, input);
	// Lo que el capitán devolvió sale de sus otras salidas recurrentes pendientes (después de guardar esta, con su asignación nueva).
	if (input.captainUserId) await pruneRecurringPreaching(db);
	await publishNotices(db, id, actorId);
	return id;
}

export async function updateSession(db: Database, id: string, input: SessionInput, actorId: string): Promise<void> {
	const [existing] = await db.select({ id: preachingSessions.id }).from(preachingSessions).where(eq(preachingSessions.id, id)).limit(1);
	if (!existing) throw new PreachingFailure("not_found");
	await assignToCaptain(db, input, actorId);
	const kind = await validate(db, input);
	await db
		.update(preachingSessions)
		.set({
			sessionDate: input.date,
			sessionTime: input.time,
			note: input.note,
			kind,
			recurring: input.recurring,
			captainUserId: input.captainUserId ?? null,
			updatedAt: new Date(),
		})
		.where(eq(preachingSessions.id, id));
	await writeChildren(db, id, input);
	if (input.captainUserId) await pruneRecurringPreaching(db);
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
export async function publishNotices(db: Database, sessionId: string, actorId: string, opts: { departureChanged?: boolean } = {}): Promise<void> {
	const [session] = await db.select().from(preachingSessions).where(eq(preachingSessions.id, sessionId)).limit(1);
	if (!session) throw new PreachingFailure("not_found");
	await retract(db, session.notificationIds);

	const [view] = (await listSessions(db)).filter((s) => s.id === sessionId);
	const territoryText = view.territories.map((t) => (t.name ? `${t.number} — ${t.name}` : t.number)).join(", ");
	const title = `${opts.departureChanged ? "Cambió el punto de salida — " : ""}Predicación — ${formatLongDate(view.date)}, ${time12(view.time)}`;
	// Punto de salida de ese día (y las indicaciones) por territorio; con un solo territorio, sin repetir su número.
	const departureLines = view.territories.flatMap((t) => {
		const prefix = view.territories.length > 1 ? `${t.number}: ` : "";
		return [
			...(t.departure ? [`Salida: ${prefix}${departureText(t.departure)}`] : []),
			...(t.meetingPlace?.trim() ? [`${prefix}${t.meetingPlace.trim()}`] : []),
		];
	});
	const message = `**${title}**\n${view.territories.length === 1 ? "Territorio" : "Territorios"}: ${territoryText}${departureLines.length ? `\n${departureLines.join("\n")}` : ""}${view.note ? `\n${view.note}` : ""}`;
	const departureShort = view.territories
		.filter((t) => t.departure)
		.map((t) => t.departure!.name)
		.join(", ");

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

	const payload = {
		title,
		body: `${view.territories.length === 1 ? "Territorio" : "Territorios"} ${territoryText}${departureShort ? ` · Salida: ${departureShort}` : ""}${view.note ? ` · ${view.note}` : ""}`.slice(0, 220),
		url: "/panel",
	};
	await sendPushes(
		db,
		[...new Set(pushUserIds)].map((userId) => ({ userId, payload })),
	);
}

/** ¿Puede esta persona cambiar el punto de salida de ese territorio en la salida? `canManage` = `canManageDepartures` (quien
 * administra la predicación o los territorios, el secretario y el siervo de territorios: cualquier territorio); si no, solo el
 * capitán (quien tiene el territorio asignado) el suyo. Y solo antes de la salida o hasta 2 horas después de su hora. */
export function canChangeDeparture(view: Pick<SessionView, "date" | "time">, territory: Pick<SessionTerritory, "assigneeUserId" | "departures">, userId: string, canManage: boolean, now = nicaraguaNow()): boolean {
	if (territory.departures.length < 2) return false;
	if (!canManage && territory.assigneeUserId !== userId) return false;
	return canChangeDepartureAt(view.date, view.time, now);
}

/** Cambia el punto de salida de un territorio en una salida (`fid` null = el predeterminado) y, si ya se había avisado, reenvía el
 * aviso («Cambió el punto de salida»). Lanza PreachingFailure si no existe, si el punto no es del territorio o si ya pasó el plazo. */
export async function changeDeparture(
	db: Database,
	sessionId: string,
	territoryId: string,
	fid: string | null,
	actor: { userId: string; canManage: boolean },
): Promise<void> {
	const [view] = (await listSessions(db)).filter((s) => s.id === sessionId);
	const territory = view?.territories.find((t) => t.id === territoryId);
	if (!view || !territory) throw new PreachingFailure("not_found");
	if (!actor.canManage && territory.assigneeUserId !== actor.userId) throw new PreachingFailure("not_found");
	if (!canChangeDepartureAt(view.date, view.time, nicaraguaNow())) throw new PreachingFailure("departure_locked");
	if (fid && !territory.departures.some((d) => d.fid === fid)) throw new PreachingFailure("invalid_departure");
	if ((territory.departureFid ?? null) === fid) return;
	await db
		.update(preachingSessionTerritories)
		.set({ departureFid: fid })
		.where(and(eq(preachingSessionTerritories.sessionId, sessionId), eq(preachingSessionTerritories.territoryId, territoryId)));
	const before = resolveDeparture(territory.departures, territory.departureFid)?.fid;
	const after = resolveDeparture(territory.departures, fid)?.fid;
	if (view.notifiedAt && before !== after) await publishNotices(db, sessionId, actor.userId, { departureChanged: true });
}
