import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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
