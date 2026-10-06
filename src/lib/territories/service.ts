import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { notificationRecipients, notifications, territories, territoryAssignments, users } from "@/db/schema";
import type { TerritoryKind } from "@/lib/territories/geo";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { notifyUsers } from "@/lib/push/dispatch";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";

export type TerritoryError =
	| "territory_not_found"
	| "assignment_not_found"
	| "assignee_invalid"
	| "not_assignee"
	| "already_resolved"
	| "not_assigned"
	| "number_taken"
	| "map_not_allowed";

export class TerritoryFailure extends Error {
	constructor(readonly code: TerritoryError) {
		super(code);
	}
}

export type AssignmentStatus = "assigned" | "completed" | "returned";

export interface AssignmentView {
	id: string;
	assigneeUserId: string;
	assigneeName: string;
	assignedAt: Date;
	status: AssignmentStatus;
	resolvedAt: Date | null;
	resolutionComment: string | null;
	notifiedAt: Date | null;
}

export interface TerritoryListItem {
	id: string;
	number: string;
	kind: TerritoryKind;
	name: string | null;
	notes: string | null;
	hasMap: boolean;
	/** Asignación vigente, si la hay. */
	current: AssignmentView | null;
	/** Última asignación resuelta (completada o devuelta). */
	last: AssignmentView | null;
}

type AssignmentRow = AssignmentView & { territoryId: string };

function loadAssignmentRows(db: Database, territoryId?: string): Promise<AssignmentRow[]> {
	const query = db
		.select({
			id: territoryAssignments.id,
			territoryId: territoryAssignments.territoryId,
			assigneeUserId: territoryAssignments.assigneeUserId,
			assigneeName: users.fullName,
			assignedAt: territoryAssignments.assignedAt,
			status: territoryAssignments.status,
			resolvedAt: territoryAssignments.resolvedAt,
			resolutionComment: territoryAssignments.resolutionComment,
			notifiedAt: territoryAssignments.notifiedAt,
		})
		.from(territoryAssignments)
		.innerJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
		.orderBy(desc(territoryAssignments.assignedAt));
	return territoryId ? query.where(eq(territoryAssignments.territoryId, territoryId)) : query;
}

export async function listTerritories(db: Database): Promise<TerritoryListItem[]> {
	const [rows, assignmentRows] = await Promise.all([
		db
			.select({
				id: territories.id,
				number: territories.number,
				kind: territories.kind,
				name: territories.name,
				notes: territories.notes,
				hasMap: sql<number>`(${territories.mapData} is not null)`,
			})
			.from(territories),
		loadAssignmentRows(db),
	]);

	const currentBy = new Map<string, AssignmentRow>();
	const lastBy = new Map<string, AssignmentRow>();
	// Vienen de la más reciente a la más antigua.
	for (const a of assignmentRows) {
		if (a.status === "assigned") currentBy.set(a.territoryId, a);
		else if (!lastBy.has(a.territoryId)) lastBy.set(a.territoryId, a);
	}

	return rows
		.map((r) => ({
			id: r.id,
			number: r.number,
			kind: r.kind,
			name: r.name,
			notes: r.notes,
			hasMap: !!r.hasMap,
			current: currentBy.get(r.id) ?? null,
			last: lastBy.get(r.id) ?? null,
		}))
		.sort((a, b) => a.number.localeCompare(b.number, "es", { numeric: true }));
}

export async function getTerritoryWithHistory(db: Database, territoryId: string) {
	const [territory] = await db.select().from(territories).where(eq(territories.id, territoryId)).limit(1);
	if (!territory) throw new TerritoryFailure("territory_not_found");
	const history = await loadAssignmentRows(db, territoryId);
	return { territory, history };
}

export async function assertNumberFree(db: Database, number: string, exceptId?: string): Promise<void> {
	const [clash] = await db
		.select({ id: territories.id })
		.from(territories)
		.where(exceptId ? and(eq(territories.number, number), ne(territories.id, exceptId)) : eq(territories.number, number))
		.limit(1);
	if (clash) throw new TerritoryFailure("number_taken");
}

/** Borra los avisos (destinatarios y ocultamientos caen en cascada). */
async function deleteNotifications(db: Database, ids: (string | null)[]) {
	const real = ids.filter((id): id is string => !!id);
	if (real.length > 0) await db.delete(notifications).where(inArray(notifications.id, real));
}

async function getActiveAssignment(db: Database, territoryId: string) {
	const [row] = await db
		.select()
		.from(territoryAssignments)
		.where(and(eq(territoryAssignments.territoryId, territoryId), eq(territoryAssignments.status, "assigned")))
		.limit(1);
	return row ?? null;
}

async function describeTerritory(db: Database, territoryId: string) {
	const [t] = await db
		.select({ number: territories.number, name: territories.name })
		.from(territories)
		.where(eq(territories.id, territoryId))
		.limit(1);
	if (!t) throw new TerritoryFailure("territory_not_found");
	return { ...t, label: t.name ? `${t.number} — ${t.name}` : t.number };
}

/** Privilegio que hace a alguien asignable según el tipo de territorio. */
export const ASSIGNABLE_PRIVILEGE_ID: Record<TerritoryKind, string> = {
	general: PRIVILEGE_IDS.TERRITORY_ASSIGNABLE,
	public_preaching: PRIVILEGE_IDS.PUBLIC_PREACHING_ASSIGNABLE,
};

/** Personas a las que se puede encargar un territorio de este tipo: quienes
 * tienen el privilegio "Asignable para territorio" (General) o "Asignable para
 * predicación pública" (Predicación pública). */
export async function listAssignableUsers(db: Database, kind: TerritoryKind) {
	const eligible = await getEligiblePublishers(db, ASSIGNABLE_PRIVILEGE_ID[kind]);
	return eligible.map((u) => ({ id: u.id, fullName: u.fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

/** Asigna el territorio a un encargado. Si ya tenía uno vigente, lo cambia
 * (y retira el aviso que se le había enviado al anterior). No avisa: el aviso
 * sale con el botón "Enviar" (notifyAssignee). */
export async function assignTerritory(db: Database, territoryId: string, assigneeUserId: string, byUserId: string) {
	const [territory] = await db.select({ kind: territories.kind }).from(territories).where(eq(territories.id, territoryId)).limit(1);
	if (!territory) throw new TerritoryFailure("territory_not_found");

	// Solo se puede encargar a quien tenga el privilegio que corresponde al tipo.
	const assignable = await listAssignableUsers(db, territory.kind);
	if (!assignable.some((u) => u.id === assigneeUserId)) throw new TerritoryFailure("assignee_invalid");

	const current = await getActiveAssignment(db, territoryId);
	if (current) {
		if (current.assigneeUserId === assigneeUserId) return;
		await deleteNotifications(db, [current.notificationId]);
		await db
			.update(territoryAssignments)
			.set({
				assigneeUserId,
				assignedByUserId: byUserId,
				assignedAt: new Date(),
				notificationId: null,
				notifiedAt: null,
			})
			.where(eq(territoryAssignments.id, current.id));
		return;
	}

	await db.insert(territoryAssignments).values({ territoryId, assigneeUserId, assignedByUserId: byUserId });
}

/** Quita al encargado vigente (sin dejar registro: nunca llegó a resolverlo). */
export async function unassignTerritory(db: Database, territoryId: string) {
	const current = await getActiveAssignment(db, territoryId);
	if (!current) throw new TerritoryFailure("not_assigned");
	await deleteNotifications(db, [current.notificationId]);
	await db.delete(territoryAssignments).where(eq(territoryAssignments.id, current.id));
}

function inDays(days: number): string {
	return toISODate(addDays(parseISODate(new Date().toISOString().slice(0, 10)), days));
}

/** Botón "Enviar" de la asignación: notificación en Mi Panel + push para el
 * encargado. Reenviar reemplaza el aviso anterior. */
export async function notifyAssignee(db: Database, territoryId: string, senderUserId: string) {
	const current = await getActiveAssignment(db, territoryId);
	if (!current) throw new TerritoryFailure("not_assigned");
	const territory = await describeTerritory(db, territoryId);

	await deleteNotifications(db, [current.notificationId]);

	const message = `Se te asignó el territorio ${territory.label}. Míralo en Mi panel → Mis próximas asignaciones, donde puedes ver el mapa y marcarlo como completado o devolverlo.`;
	const [notification] = await db
		.insert(notifications)
		.values({ senderUserId, scope: "publisher", message, expiresAt: inDays(60) })
		.returning({ id: notifications.id });
	if (!notification) throw new Error("territory_notification_insert_failed");
	await db.insert(notificationRecipients).values({ notificationId: notification.id, userId: current.assigneeUserId });

	await db
		.update(territoryAssignments)
		.set({ notificationId: notification.id, notifiedAt: new Date() })
		.where(eq(territoryAssignments.id, current.id));

	await notifyUsers(db, [current.assigneeUserId], { title: `Territorio ${territory.number}`, body: message, url: "/panel" });
}

const RESOLUTION_VERB = { completed: "completó", returned: "devolvió" } as const;
const RESOLUTION_TITLE = { completed: "completado", returned: "devuelto" } as const;

/** El encargado completa o devuelve su territorio (con comentario opcional):
 * la asignación queda con ese estado y la fecha, y se avisa (notificación +
 * push) a quienes administran territorios. */
export async function resolveAssignment(
	db: Database,
	assignmentId: string,
	userId: string,
	status: "completed" | "returned",
	comment: string | null,
) {
	const [assignment] = await db.select().from(territoryAssignments).where(eq(territoryAssignments.id, assignmentId)).limit(1);
	if (!assignment) throw new TerritoryFailure("assignment_not_found");
	if (assignment.assigneeUserId !== userId) throw new TerritoryFailure("not_assignee");
	if (assignment.status !== "assigned") throw new TerritoryFailure("already_resolved");

	const resolved = await db
		.update(territoryAssignments)
		.set({ status, resolvedAt: new Date(), resolutionComment: comment })
		.where(and(eq(territoryAssignments.id, assignmentId), eq(territoryAssignments.status, "assigned")))
		.returning({ id: territoryAssignments.id });
	if (resolved.length === 0) throw new TerritoryFailure("already_resolved");

	// El aviso de "se te asignó" ya no tiene objeto.
	await deleteNotifications(db, [assignment.notificationId]);

	const [territory, [actor], managers] = await Promise.all([
		describeTerritory(db, assignment.territoryId),
		db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1),
		getEligiblePublishers(db, PRIVILEGE_IDS.TERRITORY_MANAGEMENT, { excludeUserIds: [userId] }),
	]);
	if (managers.length === 0) return;

	const message = `${actor?.fullName ?? "El encargado"} ${RESOLUTION_VERB[status]} el territorio ${territory.label}.${comment ? ` Comentario: ${comment}` : ""}`;
	const [notification] = await db
		.insert(notifications)
		.values({ senderUserId: userId, scope: "publisher", message, expiresAt: inDays(30) })
		.returning({ id: notifications.id });
	if (!notification) throw new Error("territory_notification_insert_failed");
	const recipientIds = managers.map((m) => m.id);
	await db.insert(notificationRecipients).values(recipientIds.map((id) => ({ notificationId: notification.id, userId: id })));
	await notifyUsers(db, recipientIds, {
		title: `Territorio ${territory.number} ${RESOLUTION_TITLE[status]}`,
		body: message,
		url: "/territories",
	});
}

/** Borra el territorio con todo su historial y los avisos pendientes. */
export async function deleteTerritory(db: Database, territoryId: string) {
	const rows = await db
		.select({ notificationId: territoryAssignments.notificationId })
		.from(territoryAssignments)
		.where(eq(territoryAssignments.territoryId, territoryId));
	await deleteNotifications(
		db,
		rows.map((r) => r.notificationId),
	);
	await db.delete(territoryAssignments).where(eq(territoryAssignments.territoryId, territoryId));
	await db.delete(territories).where(eq(territories.id, territoryId));
}

/** ¿Tiene este usuario el territorio como asignación vigente? (para que el
 * encargado pueda ver el mapa sin acceso al módulo). */
export async function isCurrentAssignee(db: Database, territoryId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: territoryAssignments.id })
		.from(territoryAssignments)
		.where(
			and(
				eq(territoryAssignments.territoryId, territoryId),
				eq(territoryAssignments.assigneeUserId, userId),
				eq(territoryAssignments.status, "assigned"),
			),
		)
		.limit(1);
	return !!row;
}

export interface AssignmentListItem extends AssignmentView {
	territoryId: string;
	territoryNumber: string;
	territoryName: string | null;
	territoryKind: TerritoryKind;
}

/** Todas las asignaciones (vigentes e historial), de la más reciente a la más antigua. */
export async function listAssignments(db: Database): Promise<AssignmentListItem[]> {
	const rows = await db
		.select({
			id: territoryAssignments.id,
			territoryId: territoryAssignments.territoryId,
			territoryNumber: territories.number,
			territoryName: territories.name,
			territoryKind: territories.kind,
			assigneeUserId: territoryAssignments.assigneeUserId,
			assigneeName: users.fullName,
			assignedAt: territoryAssignments.assignedAt,
			status: territoryAssignments.status,
			resolvedAt: territoryAssignments.resolvedAt,
			resolutionComment: territoryAssignments.resolutionComment,
			notifiedAt: territoryAssignments.notifiedAt,
		})
		.from(territoryAssignments)
		.innerJoin(territories, eq(territories.id, territoryAssignments.territoryId))
		.innerJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
		.orderBy(desc(territoryAssignments.assignedAt));
	return rows;
}

/** El administrador de territorios cierra una asignación vigente en nombre del
 * encargado (completada o devuelta). No avisa a nadie: es quien administra. */
export async function adminResolveAssignment(
	db: Database,
	assignmentId: string,
	status: "completed" | "returned",
	comment: string | null,
) {
	const [assignment] = await db.select().from(territoryAssignments).where(eq(territoryAssignments.id, assignmentId)).limit(1);
	if (!assignment) throw new TerritoryFailure("assignment_not_found");
	if (assignment.status !== "assigned") throw new TerritoryFailure("already_resolved");

	const resolved = await db
		.update(territoryAssignments)
		.set({ status, resolvedAt: new Date(), resolutionComment: comment })
		.where(and(eq(territoryAssignments.id, assignmentId), eq(territoryAssignments.status, "assigned")))
		.returning({ id: territoryAssignments.id });
	if (resolved.length === 0) throw new TerritoryFailure("already_resolved");
	await deleteNotifications(db, [assignment.notificationId]);
}

/** Cancela una asignación vigente o borra una del historial (y su aviso). */
export async function deleteAssignment(db: Database, assignmentId: string) {
	const [assignment] = await db.select().from(territoryAssignments).where(eq(territoryAssignments.id, assignmentId)).limit(1);
	if (!assignment) throw new TerritoryFailure("assignment_not_found");
	await deleteNotifications(db, [assignment.notificationId]);
	await db.delete(territoryAssignments).where(eq(territoryAssignments.id, assignmentId));
}
