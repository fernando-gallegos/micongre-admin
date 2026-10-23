import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// Una sola fila (id fijo CONGREGATION_ROW_ID) — la app administra una única
// congregación; no es un catálogo multi-tenant.
export const congregations = sqliteTable("congregations", {
	id: text("id").primaryKey(),
	congregationNumber: text("congregation_number"),
	name: text("name").notNull(),
	circuitId: text("circuit_id"),
	language: text("language"),
	kingdomHallAddress: text("kingdom_hall_address"),
	isContactCongregation: integer("is_contact_congregation", { mode: "boolean" }).notNull().default(false),
	cobeUserId: text("cobe_user_id").references(() => users.id),
	secretaryUserId: text("secretary_user_id").references(() => users.id),
	serviceOverseerUserId: text("service_overseer_user_id").references(() => users.id),
	// JSON: { midweek: {day, time}, weekend: {day, time} }
	meetingSchedules: text("meeting_schedules"),
	// Tema de los reportes descargables (ver lib/export/themes.ts); null = predeterminado.
	reportTheme: text("report_theme"),
	// Hora por defecto de las salidas de predicación ("HH:MM"), para precargarla al agregar una.
	preachingTime: text("preaching_time"),
	// Dirección pública de la app (origen, p. ej. https://mi-congregacion.micongre.app): base de los enlaces de acceso y del QR.
	publicUrl: text("public_url"),
	// Recordatorio de asignaciones (lunes: la semana; viernes: el fin de semana): hora local de Nicaragua (0-23) o null = desactivado.
	reminderHour: integer("reminder_hour"),
	// Último día (local) en que se envió, para no repetirlo.
	reminderLastRun: text("reminder_last_run"),
	// Si es true, la reunión de entre semana no lleva oración inicial (ni en el formulario ni en los reportes).
	skipOpeningPrayer: integer("skip_opening_prayer", { mode: "boolean" }).notNull().default(false),
	// Animaciones de bienvenida en Mi Panel (web): apagadas por defecto; los archivos viven en welcome_animations.
	animationsEnabled: integer("animations_enabled", { mode: "boolean" }).notNull().default(false),
	// Enlaces de Mi Panel (grupos de mensajería con su color, y Zoom).
	linkCongregationUrl: text("link_congregation_url"),
	linkCongregationColor: text("link_congregation_color"),
	linkAppointedUrl: text("link_appointed_url"),
	linkAppointedColor: text("link_appointed_color"),
	linkEldersUrl: text("link_elders_url"),
	linkEldersColor: text("link_elders_color"),
	// Solo precursores regulares, solo siervos ministeriales y solo el comité de la congregación (migración 0067).
	linkPioneersUrl: text("link_pioneers_url"),
	linkPioneersColor: text("link_pioneers_color"),
	linkMinisterialUrl: text("link_ministerial_url"),
	linkMinisterialColor: text("link_ministerial_color"),
	linkCommitteeUrl: text("link_committee_url"),
	linkCommitteeColor: text("link_committee_color"),
	zoomUrl: text("zoom_url"),
	// Montos en centavos enteros — son datos contables que deben cuadrar exacto
	// (a diferencia de service_reports.hours, que es una medida aproximada).
	monthlyContributionCents: integer("monthly_contribution_cents"),
	maxBalanceApprovedCents: integer("max_balance_approved_cents"),
	maxSinglePaymentLimitCents: integer("max_single_payment_limit_cents"),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const CONGREGATION_ROW_ID = "main";
