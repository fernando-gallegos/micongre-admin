import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, sqliteView, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { MEETING_TYPES } from "./operational";

// meetingId es polimórfico, igual que en operational_schedules — ver esa nota.
export const meetingAttendance = sqliteTable(
	"meeting_attendance",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingType: text("meeting_type", { enum: MEETING_TYPES }).notNull(),
		meetingId: text("meeting_id").notNull(),
		meetingDate: text("meeting_date").notNull(),
		inPersonCount: integer("in_person_count").notNull().default(0),
		zoomCount: integer("zoom_count").notNull().default(0),
		recordedByUserId: text("recorded_by_user_id").references(() => users.id),
		recordedAt: integer("recorded_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("attendance_meeting_idx").on(t.meetingType, t.meetingId),
		index("attendance_date_idx").on(t.meetingDate),
	],
);

// Referencia a la VIEW de solo lectura sembrada por
// migrations/0012_indexes_and_views.sql (agregado mensual entre semana/fin de
// semana) — `.existing()` porque la VIEW ya existe en la BD, Drizzle no la crea.
export const monthlyAttendanceSummary = sqliteView("monthly_attendance_summary", {
	periodYear: integer("period_year"),
	periodMonth: integer("period_month"),
	meetingType: text("meeting_type", { enum: MEETING_TYPES }),
	meetingsRecorded: integer("meetings_recorded"),
	totalInPerson: integer("total_in_person"),
	totalZoom: integer("total_zoom"),
}).existing();
