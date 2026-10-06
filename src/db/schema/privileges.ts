import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { APPOINTMENT_TYPES } from "./appointments";

export const PRIVILEGE_CATEGORIES = ["meeting", "operational", "administrative"] as const;

export const privileges = sqliteTable(
	"privileges",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		code: text("code").notNull(),
		name: text("name").notNull(),
		category: text("category", { enum: PRIVILEGE_CATEGORIES }).notNull(),
		requiresMale: integer("requires_male", { mode: "boolean" }).notNull().default(false),
		requiresBaptized: integer("requires_baptized", { mode: "boolean" }).notNull().default(false),
		requiresAdult: integer("requires_adult", { mode: "boolean" }).notNull().default(false),
		allowsMinorWithParentalConsent: integer("allows_minor_with_parental_consent", { mode: "boolean" })
			.notNull()
			.default(false),
		isSystemDefined: integer("is_system_defined", { mode: "boolean" }).notNull().default(false),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [uniqueIndex("priv_code_idx").on(t.code)],
);

export const appointmentPrivilegeRules = sqliteTable(
	"appointment_privilege_rules",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		privilegeId: text("privilege_id")
			.notNull()
			.references(() => privileges.id, { onDelete: "cascade" }),
		appointmentType: text("appointment_type", { enum: APPOINTMENT_TYPES }).notNull(),
		requiresCompetencyFlag: integer("requires_competency_flag", { mode: "boolean" })
			.notNull()
			.default(false),
	},
	(t) => [uniqueIndex("rule_priv_appt_idx").on(t.privilegeId, t.appointmentType)],
);

export const userPrivileges = sqliteTable(
	"user_privileges",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		privilegeId: text("privilege_id")
			.notNull()
			.references(() => privileges.id, { onDelete: "cascade" }),
		approvedAt: text("approved_at").notNull(),
		approvedByUserId: text("approved_by_user_id").references(() => users.id),
		parentalConsent: integer("parental_consent", { mode: "boolean" }).notNull().default(false),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		revokedAt: text("revoked_at"),
	},
	(t) => [
		uniqueIndex("user_priv_idx").on(t.userId, t.privilegeId),
		index("user_priv_active_idx").on(t.privilegeId, t.active),
	],
);
