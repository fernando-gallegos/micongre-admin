import { sql } from "drizzle-orm";
import { index, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const APPOINTMENT_TYPES = [
	"elder",
	"ministerial_servant",
	"auxiliary_pioneer",
	"regular_pioneer",
	"special_pioneer",
	"missionary",
	"cobe",
	"secretary",
	"service_overseer",
	"watchtower_conductor",
	"lm_meeting_overseer",
	"auxiliary_counselor",
	"field_service_group_overseer",
	"field_service_group_assistant",
	"literature_servant",
	"accounts_servant",
	"territory_servant",
	"public_talk_coordinator",
	"av_coordinator",
	"maintenance_coordinator",
] as const;

export const theocraticAppointments = sqliteTable(
	"theocratic_appointments",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		appointmentType: text("appointment_type", { enum: APPOINTMENT_TYPES }).notNull(),
		startDate: text("start_date").notNull(),
		// null = nombramiento vigente
		endDate: text("end_date"),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		index("appt_user_idx").on(t.userId, t.endDate),
		index("appt_type_idx").on(t.appointmentType),
	],
);
