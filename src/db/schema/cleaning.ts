import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { fieldServiceGroups } from "./fieldService";
import { notifications } from "./notifications";
import { MEETING_TYPES } from "./operational";
import { users } from "./users";

// Los 3 tipos de limpieza de la Guía/Cronograma de limpieza del Salón del
// Reino: ligera (después de cada reunión), profunda (cada semana) y a fondo
// (por lo menos una vez al año).
export const CLEANING_KINDS = ["ligera", "profunda", "a_fondo"] as const;

// "group" = uno de nuestros grupos de servicio, "own_congregation" = toda
// nuestra congregación, "congregation" = otra congregación del salón.
export const CLEANING_ASSIGNEE_TYPES = ["group", "own_congregation", "congregation"] as const;

// Otras congregaciones que comparten el Salón del Reino. Cuando una tarea queda
// a cargo de una de ellas no se avisa a nadie en nuestra congregación.
export const cleaningCongregations = sqliteTable("cleaning_congregations", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text("name").notNull(),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Una tarea de limpieza, identificada según su tipo: ligera → una reunión
// (meetingType + meetingId, polimórfico sin FK real, igual que
// operational_schedules; integridad en lib/cleaning/meetings.ts), profunda →
// una semana (weekStart = lunes), a fondo → una fecha (taskDate; puede haber
// varias al año). Las de tipo ligera/profunda se crean al asignar o marcar por
// primera vez; completedAt es el recuadro que marca el coordinador de limpieza.
export const cleaningTasks = sqliteTable(
	"cleaning_tasks",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text("kind", { enum: CLEANING_KINDS }).notNull(),
		meetingType: text("meeting_type", { enum: MEETING_TYPES }),
		meetingId: text("meeting_id"),
		weekStart: text("week_start"),
		taskDate: text("task_date"),
		notes: text("notes"),
		completedAt: integer("completed_at", { mode: "timestamp" }),
		completedByUserId: text("completed_by_user_id").references(() => users.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("cleaning_tasks_meeting_idx")
			.on(t.meetingType, t.meetingId)
			.where(sql`${t.kind} = 'ligera'`),
		uniqueIndex("cleaning_tasks_week_idx")
			.on(t.weekStart)
			.where(sql`${t.kind} = 'profunda'`),
		index("cleaning_tasks_date_idx").on(t.taskDate),
	],
);

// Quiénes realizan una tarea (varios posibles): un grupo nuestro, toda nuestra
// congregación u otra congregación del salón — exactamente uno de groupId /
// congregationId según assigneeType (CHECK en la migración). notificationId es
// el aviso enviado a ese responsable (solo group/own_congregation); se borra
// al quitarlo para no dejar avisos huérfanos en Mi Panel.
export const cleaningTaskAssignees = sqliteTable(
	"cleaning_task_assignees",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		taskId: text("task_id")
			.notNull()
			.references(() => cleaningTasks.id, { onDelete: "cascade" }),
		assigneeType: text("assignee_type", { enum: CLEANING_ASSIGNEE_TYPES }).notNull(),
		groupId: text("group_id").references(() => fieldServiceGroups.id),
		congregationId: text("congregation_id").references(() => cleaningCongregations.id),
		notificationId: text("notification_id").references(() => notifications.id, { onDelete: "set null" }),
		notifiedAt: integer("notified_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		index("cleaning_assignees_task_idx").on(t.taskId),
		index("cleaning_assignees_group_idx").on(t.groupId),
		uniqueIndex("cleaning_assignees_group_uq")
			.on(t.taskId, t.groupId)
			.where(sql`${t.groupId} is not null`),
		uniqueIndex("cleaning_assignees_congregation_uq")
			.on(t.taskId, t.congregationId)
			.where(sql`${t.congregationId} is not null`),
		uniqueIndex("cleaning_assignees_own_uq")
			.on(t.taskId)
			.where(sql`${t.assigneeType} = 'own_congregation'`),
	],
);
