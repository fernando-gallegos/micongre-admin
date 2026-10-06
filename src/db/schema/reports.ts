import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const REPORT_STATUSES = ["submitted", "not_submitted", "late"] as const;

export const serviceReports = sqliteTable(
	"service_reports",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// De quién es el informe.
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Quién lo escribió realmente: el propio publicador o el superintendente/
		// auxiliar de su grupo que lo completó por él (ver lib/rbac/guards.ts).
		enteredByUserId: text("entered_by_user_id")
			.notNull()
			.references(() => users.id),
		periodYear: integer("period_year").notNull(),
		periodMonth: integer("period_month").notNull(),
		participatedInMinistry: integer("participated_in_ministry", { mode: "boolean" })
			.notNull()
			.default(true),
		isAuxiliaryPioneerThisMonth: integer("is_auxiliary_pioneer_this_month", { mode: "boolean" })
			.notNull()
			.default(false),
		hours: real("hours"),
		// Solo precursores regulares; NULL = sin horas de proyecto. Servicio + proyectos ≤ 55.
		projectHours: real("project_hours"),
		bibleStudiesCount: integer("bible_studies_count").default(0),
		creditHoursNote: text("credit_hours_note"),
		comments: text("comments"),
		submittedAt: integer("submitted_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		status: text("status", { enum: REPORT_STATUSES }).notNull().default("submitted"),
	},
	(t) => [
		uniqueIndex("report_user_period_idx").on(t.userId, t.periodYear, t.periodMonth),
		index("report_period_idx").on(t.periodYear, t.periodMonth),
	],
);
