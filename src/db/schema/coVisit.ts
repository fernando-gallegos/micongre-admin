import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const CO_RECOMMENDATION_OFFICES = ["ELDER", "MINISTERIAL_SERVANT"] as const;
export const CO_RECOMMENDATION_DECISIONS = ["PENDING", "APPROVED", "NOT_APPOINTED"] as const;

// Una fila por visita del Superintendente de Circuito (sfg cap. 15). El
// vencimiento del acceso temporal que se le otorgue (ver
// src/lib/auth/activation.ts) se ancla a endDate — no hay un campo de
// vigencia separado.
export const coVisitSchedules = sqliteTable("co_visit_schedules", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	circuitOverseerName: text("circuit_overseer_name").notNull(),
	startDate: text("start_date").notNull(),
	endDate: text("end_date").notNull(),
	// S-38 párr. 21: reemplaza el Estudio Bíblico de la Congregación por el
	// discurso de servicio del SC y cancela clases auxiliares esa semana.
	midweekMeetingModifications: integer("midweek_meeting_modifications", { mode: "boolean" })
		.notNull()
		.default(false),
	// JSON: { "2026-09-14": { lunch: "...", dinner: "..." }, ... } — texto libre
	// por celda (nombre de familia), no un FK, sfg 15:2-3.
	hospitalitySchedule: text("hospitality_schedule"),
	notes: text("notes"),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Precursores aprobados con el requisito reducido de 15 horas durante el mes
// de la visita (sfg 15:1).
export const coVisitAuxiliaryPioneers = sqliteTable(
	"co_visit_auxiliary_pioneers",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		visitId: text("visit_id")
			.notNull()
			.references(() => coVisitSchedules.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
	},
	(t) => [uniqueIndex("co_aux_pioneer_idx").on(t.visitId, t.userId)],
);

// Recomendaciones de nombramiento/baja para la visita del SC (S-62, sfg 5:7-9,23).
export const coRecommendations = sqliteTable("co_recommendations", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	visitId: text("visit_id").references(() => coVisitSchedules.id),
	candidateUserId: text("candidate_user_id")
		.notNull()
		.references(() => users.id),
	recommendedOffice: text("recommended_office", { enum: CO_RECOMMENDATION_OFFICES }).notNull(),
	isFirstTime: integer("is_first_time", { mode: "boolean" }).notNull().default(false),
	// Si fue baja en los últimos 5 años, sfg 5:6.
	isReappointment: integer("is_reappointment", { mode: "boolean" }).notNull().default(false),
	removalDate: text("removal_date"),
	removalReason: text("removal_reason"),
	previousCongregationLetterAttached: integer("previous_congregation_letter_attached", { mode: "boolean" })
		.notNull()
		.default(false),
	// JSON: checklist fijo de 1 Tim. 3 / Tito 1 — ver validation/coVisit.ts.
	biblicalQualificationsCheck: text("biblical_qualifications_check"),
	// Las 3 preguntas clave del SC (pasado familiar/personal, razones para no
	// anunciar, antecedentes de abuso a menores — sfg 5:8).
	threeMandatoryQuestionsConfirmed: integer("three_mandatory_questions_confirmed", { mode: "boolean" })
		.notNull()
		.default(false),
	circuitOverseerDecision: text("circuit_overseer_decision", { enum: CO_RECOMMENDATION_DECISIONS })
		.notNull()
		.default("PENDING"),
	announcementDate: text("announcement_date"),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});
