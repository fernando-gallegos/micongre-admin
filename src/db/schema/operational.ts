import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { privileges } from "./privileges";

export const MEETING_TYPES = ["midweek", "weekend"] as const;

// meetingId es polimórfico (apunta a midweek_meetings.id o weekend_meetings.id
// según meetingType) — sin FK real porque SQLite/D1 no soporta FKs polimórficas;
// la integridad se valida en código de aplicación (lib/collision.ts).
export const operationalSchedules = sqliteTable(
	"operational_schedules",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingType: text("meeting_type", { enum: MEETING_TYPES }).notNull(),
		meetingId: text("meeting_id").notNull(),
		privilegeId: text("privilege_id")
			.notNull()
			.references(() => privileges.id),
		assignedUserId: text("assigned_user_id").references(() => users.id),
		position: text("position"),
	},
	(t) => [
		index("op_sched_meeting_idx").on(t.meetingType, t.meetingId),
		index("op_sched_user_idx").on(t.assignedUserId),
		uniqueIndex("op_sched_unique_slot_idx").on(
			t.meetingType,
			t.meetingId,
			t.privilegeId,
			t.position,
		),
	],
);

// Plantilla de puestos de tareas operativas de la congregación, por tipo de reunión: qué puestos lleva cada reunión
// (un privilegio puede repetirse; `position` distingue a cada uno). Las reuniones se ajustan a ella al abrirse por
// primera vez, al guardarla y en el job diario, sin tocar nunca un puesto que ya tiene a alguien (lib/operational/template.ts).
export const operationalTemplateSlots = sqliteTable(
	"operational_template_slots",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingType: text("meeting_type", { enum: MEETING_TYPES }).notNull(),
		privilegeId: text("privilege_id")
			.notNull()
			.references(() => privileges.id),
		position: text("position"),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(t) => [index("op_template_type_idx").on(t.meetingType, t.sortOrder)],
);
