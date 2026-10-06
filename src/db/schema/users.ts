import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { households } from "./households";
import { fieldServiceGroups } from "./fieldService";

export const GENDERS = ["male", "female"] as const;
export const CONGREGATION_STATUSES = ["active", "inactive", "irregular"] as const;
// Lo que se elige en el formulario: "disfellowshipped" (Sacado) se guarda como
// inactive + la bandera users.disfellowshipped (ver migrations/0048).
export const CONGREGATION_STATUS_INPUTS = [...CONGREGATION_STATUSES, "disfellowshipped"] as const;
export type CongregationStatusInput = (typeof CONGREGATION_STATUS_INPUTS)[number];

/** Estado a guardar según lo elegido: Sacado = inactivo + bandera. */
export function splitCongregationStatus(input: CongregationStatusInput) {
	return input === "disfellowshipped"
		? { congregationStatus: "inactive" as const, disfellowshipped: true }
		: { congregationStatus: input, disfellowshipped: false };
}

/** Estado que se muestra: un sacado aparece como "disfellowshipped". */
export function publicCongregationStatus(row: { congregationStatus: string; disfellowshipped: boolean }): string {
	return row.disfellowshipped ? "disfellowshipped" : row.congregationStatus;
}
export const THEOCRATIC_STATUSES = ["student", "unbaptized_publisher", "baptized_publisher"] as const;
export const SYSTEM_ROLES = ["admin", "regular"] as const;
export const ACCOUNT_STATUSES = ["no_account", "invited", "active", "disabled"] as const;

export const users = sqliteTable(
	"users",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		fullName: text("full_name").notNull(),
		// Identificador de login, generado por el sistema — nunca elegido a mano ni atado a un email.
		username: text("username"),
		// Dato de contacto opcional, sin unicidad ni rol en autenticación.
		email: text("email"),
		phone: text("phone"),
		birthDate: text("birth_date"),
		baptismDate: text("baptism_date"),
		gender: text("gender", { enum: GENDERS }).notNull(),
		navShortcut: text("nav_shortcut"),
		disfellowshipped: integer("disfellowshipped", { mode: "boolean" }).notNull().default(false),
		congregationStatus: text("congregation_status", { enum: CONGREGATION_STATUSES })
			.notNull()
			.default("active"),
		theocraticStatus: text("theocratic_status", { enum: THEOCRATIC_STATUSES }).notNull(),
		emergencyContactName: text("emergency_contact_name"),
		emergencyContactPhone: text("emergency_contact_phone"),
		emergencyContactRelation: text("emergency_contact_relation"),
		isMinor: integer("is_minor", { mode: "boolean" }).notNull().default(false),
		// Tarjeta de Instrucciones Médicas (DPA) — preparación para desastres, sfg 10:2.
		hasDpaCard: integer("has_dpa_card", { mode: "boolean" }).notNull().default(false),
		// Informe de 15 minutos por edad/salud — no se infiere, lo marca el admin a mano, sfg 10:2.
		isEligibleForReducedReport: integer("is_eligible_for_reduced_report", { mode: "boolean" })
			.notNull()
			.default(false),
		guardianUserId: text("guardian_user_id").references((): AnySQLiteColumn => users.id),
		householdId: text("household_id").references(() => households.id),
		fieldServiceGroupId: text("field_service_group_id").references(
			(): AnySQLiteColumn => fieldServiceGroups.id,
			{ onDelete: "set null" },
		),
		systemRole: text("system_role", { enum: SYSTEM_ROLES }).notNull().default("regular"),
		// Admin que administra todo pero no cuenta como Publicador en ningún lado —
		// solo tiene sentido combinado con systemRole = "admin"; el PATCH normaliza
		// esto (ver api/publishers/[id]/route.ts).
		isHiddenAdmin: integer("is_hidden_admin", { mode: "boolean" }).notNull().default(false),
		accountStatus: text("account_status", { enum: ACCOUNT_STATUSES }).notNull().default("no_account"),
		passwordHash: text("password_hash"),
		passwordAlgo: text("password_algo").default("PBKDF2-SHA256"),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("users_username_idx").on(t.username),
		index("users_status_idx").on(t.congregationStatus),
		index("users_role_idx").on(t.systemRole),
		index("users_group_idx").on(t.fieldServiceGroupId),
	],
);
