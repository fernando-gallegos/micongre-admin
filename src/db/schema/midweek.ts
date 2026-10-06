import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { privileges } from "./privileges";

export const MIDWEEK_STATUSES = [
	"scheduled",
	"cancelled_assembly",
	"cancelled_memorial",
	"adjusted_co_visit",
] as const;

export const MIDWEEK_SECTION_TYPES = [
	"treasures_talk",
	"spiritual_gems",
	"bible_reading",
	"student_assignment",
	"christian_living",
	"congregation_needs",
	"cbs",
	"living_custom",
	"prayer",
] as const;

export const midweekMeetings = sqliteTable(
	"midweek_meetings",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingDate: text("meeting_date").notNull(),
		weekLabel: text("week_label"),
		status: text("status", { enum: MIDWEEK_STATUSES }).notNull().default("scheduled"),
		chairmanUserId: text("chairman_user_id").references(() => users.id),
		openingSongNumber: integer("opening_song_number"),
		closingSongNumber: integer("closing_song_number"),
		middleSongNumber: integer("middle_song_number"),
		openingPrayerUserId: text("opening_prayer_user_id").references(() => users.id),
		studyLessonReference: text("study_lesson_reference"),
		hasAuxRoom: integer("has_aux_room", { mode: "boolean" }).notNull().default(false),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [uniqueIndex("midweek_date_idx").on(t.meetingDate)],
);

export const midweekAssignments = sqliteTable(
	"midweek_assignments",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingId: text("meeting_id")
			.notNull()
			.references(() => midweekMeetings.id, { onDelete: "cascade" }),
		sectionType: text("section_type", { enum: MIDWEEK_SECTION_TYPES }).notNull(),
		sectionTitle: text("section_title"),
		// Texto instructivo completo (método, referencia de folleto, preguntas
		// de análisis) — capturado al importar de JW.ORG; null para partes
		// creadas a mano hasta que se les agregue una.
		description: text("description"),
		sequenceOrder: integer("sequence_order").notNull(),
		// Número de la parte en la guía (1. … 8.); null si se creó a mano.
		partNumber: integer("part_number"),
		room: text("room", { enum: ["main", "auxiliary"] }).notNull().default("main"),
		mainAssigneeId: text("main_assignee_id").references(() => users.id),
		assistantAssigneeId: text("assistant_assignee_id").references(() => users.id),
		durationMinutes: integer("duration_minutes"),
		privilegeId: text("privilege_id").references(() => privileges.id),
	},
	(t) => [
		index("midweek_assign_meeting_idx").on(t.meetingId),
		index("midweek_assign_main_idx").on(t.mainAssigneeId),
	],
);
