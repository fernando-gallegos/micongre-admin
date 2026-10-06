import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	cleaningCongregations,
	cleaningTaskAssignees,
	cleaningTasks,
	fieldServiceGroups,
	notifications,
	users,
} from "@/db/schema";
import { formatShortDate } from "@/lib/dateFormat";
import { addDays, formatWeekRangeEs, parseISODate, toISODate } from "@/lib/mwb/dates";
import { notifyUsers } from "@/lib/push/dispatch";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { chunked, getCleaningMeeting } from "./meetings";
import {
	CLEANING_KIND_LABEL,
	CLEANING_MEETING_LABEL,
	type CleaningKind,
	type CleaningMeetingType,
	OWN_CONGREGATION_LABEL,
} from "./labels";

export type CleaningTask = typeof cleaningTasks.$inferSelect;

/** Cómo se identifica una tarea en una petición: ligera por reunión, profunda
 * por semana (lunes), a fondo por su id (siempre existe: se programa aparte). */
export type CleaningTaskRef =
	| { kind: "ligera"; meetingType: CleaningMeetingType; meetingId: string }
	| { kind: "profunda"; weekStart: string }
	| { kind: "a_fondo"; taskId: string };

export type CleaningError =
	| "meeting_not_found"
	| "meeting_cancelled"
	| "meeting_past"
	| "task_not_found"
	| "invalid_week"
	| "group_not_found"
	| "congregation_not_found"
	| "nothing_to_notify"
	| "empty_recipients"
	| "task_past";

export class CleaningFailure extends Error {
	constructor(readonly code: CleaningError) {
		super(code);
	}
}

export interface AssigneeView {
	id: string;
	type: "group" | "own_congregation" | "congregation";
	groupId: string | null;
	groupName: string | null;
	groupColor: string | null;
	congregationId: string | null;
	congregationName: string | null;
	notifiedAt: Date | null;
}

export function isValidMonday(iso: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
	const d = parseISODate(iso);
	return !Number.isNaN(d.getTime()) && toISODate(d) === iso && d.getUTCDay() === 1;
}

export async function findTask(db: Database, ref: CleaningTaskRef): Promise<CleaningTask | null> {
	const where =
		ref.kind === "ligera"
			? and(
					eq(cleaningTasks.kind, "ligera"),
					eq(cleaningTasks.meetingType, ref.meetingType),
					eq(cleaningTasks.meetingId, ref.meetingId),
				)
			: ref.kind === "profunda"
				? and(eq(cleaningTasks.kind, "profunda"), eq(cleaningTasks.weekStart, ref.weekStart))
				: and(eq(cleaningTasks.kind, "a_fondo"), eq(cleaningTasks.id, ref.taskId));
	const [row] = await db.select().from(cleaningTasks).where(where).limit(1);
	return row ?? null;
}

/** La tarea de `ref`; si es de tipo ligera/profunda y todavía no existe, la
 * crea (valida la reunión/semana). A fondo nunca se crea aquí. */
export async function ensureTask(db: Database, ref: CleaningTaskRef): Promise<CleaningTask> {
	const existing = await findTask(db, ref);
	if (existing) return existing;

	if (ref.kind === "a_fondo") throw new CleaningFailure("task_not_found");

	if (ref.kind === "ligera") {
		const meeting = await getCleaningMeeting(db, ref.meetingType, ref.meetingId);
		if (!meeting) throw new CleaningFailure("meeting_not_found");
		if (meeting.cancelled) throw new CleaningFailure("meeting_cancelled");
		await db
			.insert(cleaningTasks)
			.values({ kind: "ligera", meetingType: ref.meetingType, meetingId: ref.meetingId })
			.onConflictDoNothing();
	} else {
		if (!isValidMonday(ref.weekStart)) throw new CleaningFailure("invalid_week");
		await db.insert(cleaningTasks).values({ kind: "profunda", weekStart: ref.weekStart }).onConflictDoNothing();
	}

	const created = await findTask(db, ref);
	if (!created) throw new Error("cleaning_task_insert_failed");
	return created;
}

export async function loadAssignees(db: Database, taskIds: string[]): Promise<Map<string, AssigneeView[]>> {
	const out = new Map<string, AssigneeView[]>();
	if (taskIds.length === 0) return out;

	const rowParts = await Promise.all(
		chunked(taskIds).map((ids) =>
			db
				.select({
					taskId: cleaningTaskAssignees.taskId,
					id: cleaningTaskAssignees.id,
					type: cleaningTaskAssignees.assigneeType,
					groupId: cleaningTaskAssignees.groupId,
					groupName: fieldServiceGroups.name,
					groupColor: fieldServiceGroups.color,
					congregationId: cleaningTaskAssignees.congregationId,
					congregationName: cleaningCongregations.name,
					notifiedAt: cleaningTaskAssignees.notifiedAt,
					createdAt: cleaningTaskAssignees.createdAt,
				})
				.from(cleaningTaskAssignees)
				.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, cleaningTaskAssignees.groupId))
				.leftJoin(cleaningCongregations, eq(cleaningCongregations.id, cleaningTaskAssignees.congregationId))
				.where(inArray(cleaningTaskAssignees.taskId, ids)),
		),
	);
	const rows = rowParts.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

	for (const { taskId, createdAt: _createdAt, ...view } of rows) {
		const list = out.get(taskId) ?? [];
		list.push(view);
		out.set(taskId, list);
	}
	return out;
}

/** Borra los avisos enviados a estos responsables (destinatarios y
 * ocultamientos caen en cascada) y deja sus filas sin aviso. */
async function retractNotifications(db: Database, assigneeRows: { id: string; notificationId: string | null }[]) {
	const notificationIds = assigneeRows.map((a) => a.notificationId).filter((id): id is string => !!id);
	if (notificationIds.length === 0) return;
	await db.delete(notifications).where(inArray(notifications.id, notificationIds));
	await db
		.update(cleaningTaskAssignees)
		.set({ notificationId: null, notifiedAt: null })
		.where(
			inArray(
				cleaningTaskAssignees.id,
				assigneeRows.filter((a) => a.notificationId).map((a) => a.id),
			),
		);
}

export type NewAssignee =
	| { type: "group"; groupId: string }
	| { type: "own_congregation" }
	| { type: "congregation"; congregationId: string };

/** Comprueba que el grupo/congregación elegido existe y está activo. Se llama
 * ANTES de crear la tarea, para que una petición inválida no deje una tarea
 * vacía. */
export async function validateAssignee(db: Database, assignee: NewAssignee): Promise<void> {
	if (assignee.type === "group") {
		const [group] = await db
			.select({ id: fieldServiceGroups.id })
			.from(fieldServiceGroups)
			.where(and(eq(fieldServiceGroups.id, assignee.groupId), eq(fieldServiceGroups.active, true)))
			.limit(1);
		if (!group) throw new CleaningFailure("group_not_found");
	} else if (assignee.type === "congregation") {
		const [congregation] = await db
			.select({ id: cleaningCongregations.id })
			.from(cleaningCongregations)
			.where(and(eq(cleaningCongregations.id, assignee.congregationId), eq(cleaningCongregations.active, true)))
			.limit(1);
		if (!congregation) throw new CleaningFailure("congregation_not_found");
	}
}

export async function addAssignee(db: Database, taskId: string, assignee: NewAssignee): Promise<void> {
	await db
		.insert(cleaningTaskAssignees)
		.values({
			taskId,
			assigneeType: assignee.type,
			groupId: assignee.type === "group" ? assignee.groupId : null,
			congregationId: assignee.type === "congregation" ? assignee.congregationId : null,
		})
		.onConflictDoNothing();
}

/** Quita un responsable y su aviso; las tareas ligera/profunda que quedan sin
 * responsables ni marca de realizada se eliminan (se recrean al asignar). */
export async function removeAssignee(db: Database, assigneeId: string): Promise<boolean> {
	const [assignee] = await db
		.select({ id: cleaningTaskAssignees.id, taskId: cleaningTaskAssignees.taskId, notificationId: cleaningTaskAssignees.notificationId })
		.from(cleaningTaskAssignees)
		.where(eq(cleaningTaskAssignees.id, assigneeId))
		.limit(1);
	if (!assignee) return false;

	await retractNotifications(db, [assignee]);
	await db.delete(cleaningTaskAssignees).where(eq(cleaningTaskAssignees.id, assignee.id));

	const [task] = await db.select().from(cleaningTasks).where(eq(cleaningTasks.id, assignee.taskId)).limit(1);
	if (task && task.kind !== "a_fondo" && !task.completedAt) {
		const [remaining] = await db
			.select({ id: cleaningTaskAssignees.id })
			.from(cleaningTaskAssignees)
			.where(eq(cleaningTaskAssignees.taskId, task.id))
			.limit(1);
		if (!remaining) await db.delete(cleaningTasks).where(eq(cleaningTasks.id, task.id));
	}
	return true;
}

/** Borra una limpieza a fondo programada con todos sus responsables y avisos. */
export async function deleteTask(db: Database, taskId: string): Promise<void> {
	const assignees = await db
		.select({ id: cleaningTaskAssignees.id, notificationId: cleaningTaskAssignees.notificationId })
		.from(cleaningTaskAssignees)
		.where(eq(cleaningTaskAssignees.taskId, taskId));
	await retractNotifications(db, assignees);
	await db.delete(cleaningTasks).where(eq(cleaningTasks.id, taskId));
}

export async function setCompleted(db: Database, task: CleaningTask, done: boolean, userId: string) {
	await db
		.update(cleaningTasks)
		.set(done ? { completedAt: new Date(), completedByUserId: userId } : { completedAt: null, completedByUserId: null })
		.where(eq(cleaningTasks.id, task.id));

	// Una tarea ligera/profunda sin responsables que se desmarca ya no aporta nada.
	if (!done && task.kind !== "a_fondo") {
		const [remaining] = await db
			.select({ id: cleaningTaskAssignees.id })
			.from(cleaningTaskAssignees)
			.where(eq(cleaningTaskAssignees.taskId, task.id))
			.limit(1);
		if (!remaining) await db.delete(cleaningTasks).where(eq(cleaningTasks.id, task.id));
	}
}

interface TaskWhen {
	/** Primer y último día en que la tarea "vale" (para vencer el aviso). */
	start: string;
	end: string;
	cancelled: boolean;
	phrase: string;
}

/** Cuándo cae una tarea, en texto y fechas. null si su reunión ya no existe. */
export async function describeTaskWhen(db: Database, task: CleaningTask): Promise<TaskWhen | null> {
	if (task.kind === "ligera" && task.meetingType && task.meetingId) {
		const meeting = await getCleaningMeeting(db, task.meetingType, task.meetingId);
		if (!meeting) return null;
		return {
			start: meeting.date,
			end: meeting.date,
			cancelled: meeting.cancelled,
			phrase: `después de la reunión de ${CLEANING_MEETING_LABEL[task.meetingType]} del ${formatShortDate(meeting.date)}`,
		};
	}
	if (task.kind === "profunda" && task.weekStart) {
		return {
			start: task.weekStart,
			end: toISODate(addDays(parseISODate(task.weekStart), 6)),
			cancelled: false,
			phrase: `de la semana del ${formatWeekRangeEs(task.weekStart)}`,
		};
	}
	if (task.kind === "a_fondo" && task.taskDate) {
		return { start: task.taskDate, end: task.taskDate, cancelled: false, phrase: `el ${formatShortDate(task.taskDate)}` };
	}
	return null;
}

/** Usuarios que reciben el aviso de un responsable nuestro. */
async function recipientsOf(db: Database, assignee: { type: string; groupId: string | null }): Promise<string[]> {
	const rows =
		assignee.type === "own_congregation"
			? await db.select({ id: users.id }).from(users).where(and(eq(users.accountStatus, "active"), notHiddenAdmin))
			: assignee.groupId
				? await db
						.select({ id: users.id })
						.from(users)
						.where(and(eq(users.fieldServiceGroupId, assignee.groupId), notHiddenAdmin))
				: [];
	return rows.map((r) => r.id);
}

/** Botón "Enviar notificación" de UNA fila: avisa a los responsables de
 * nuestra congregación (grupos o toda la congregación). Los responsables de
 * otras congregaciones no reciben nada — si solo hay de esas, no hay a quién
 * avisar. Reenviar reemplaza el aviso anterior. */
export async function notifyTask(db: Database, task: CleaningTask, senderUserId: string): Promise<{ sent: number }> {
	const when = await describeTaskWhen(db, task);
	if (!when) throw new CleaningFailure("meeting_not_found");
	if (when.cancelled) throw new CleaningFailure("meeting_cancelled");
	const today = new Date().toISOString().slice(0, 10);
	if (when.end < today) throw new CleaningFailure("task_past");

	const assignees = (await loadAssignees(db, [task.id])).get(task.id) ?? [];
	const ours = assignees.filter((a) => a.type !== "congregation");
	if (ours.length === 0) throw new CleaningFailure("nothing_to_notify");
	const others = assignees.filter((a) => a.type === "congregation").map((a) => a.congregationName ?? "otra congregación");

	// Se resuelven los destinatarios antes de tocar nada: si ninguno tiene a
	// quién avisar, el aviso anterior (si lo hay) se conserva.
	const plans = (
		await Promise.all(ours.map(async (assignee) => ({ assignee, recipients: await recipientsOf(db, assignee) })))
	).filter((p) => p.recipients.length > 0);
	if (plans.length === 0) throw new CleaningFailure("empty_recipients");

	await retractNotifications(
		db,
		await db
			.select({ id: cleaningTaskAssignees.id, notificationId: cleaningTaskAssignees.notificationId })
			.from(cleaningTaskAssignees)
			.where(inArray(cleaningTaskAssignees.id, plans.map((p) => p.assignee.id))),
	);

	let sent = 0;
	for (const { assignee, recipients } of plans) {
		const subject = assignee.type === "own_congregation" ? OWN_CONGREGATION_LABEL : `Tu grupo (${assignee.groupName ?? "grupo"})`;
		const together = others.length > 0 ? `, junto con ${others.join(", ")}` : "";
		const message = `${subject} tiene asignada la ${CLEANING_KIND_LABEL[task.kind as CleaningKind].toLowerCase()} del Salón del Reino ${when.phrase}${together}.`;

		const [notification] = await db
			.insert(notifications)
			.values({
				senderUserId,
				scope: assignee.type === "own_congregation" ? "congregation" : "group",
				groupId: assignee.type === "group" ? assignee.groupId : null,
				message,
				// Deja de verse en Mi Panel pasada la fecha de la limpieza.
				expiresAt: when.end,
			})
			.returning({ id: notifications.id });
		if (!notification) throw new Error("cleaning_notification_insert_failed");

		await db
			.update(cleaningTaskAssignees)
			.set({ notificationId: notification.id, notifiedAt: new Date() })
			.where(eq(cleaningTaskAssignees.id, assignee.id));
		await notifyUsers(db, recipients, {
			title: CLEANING_KIND_LABEL[task.kind as CleaningKind],
			body: message,
			url: "/panel",
		});
		sent += recipients.length;
	}

	return { sent };
}
