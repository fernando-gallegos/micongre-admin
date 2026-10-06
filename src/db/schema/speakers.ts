import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const SPEAKER_KINDS = ["local", "visiting"] as const;

export const speakerCongregations = sqliteTable(
	"speaker_congregations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text("name").notNull(),
		phone: text("phone"),
		notes: text("notes"),
		// Datos del JW Hub (ver migración 0041). Días: 0 = domingo ... 6 = sábado.
		jwUrl: text("jw_url"),
		jwLocationId: text("jw_location_id"),
		jwEventId: text("jw_event_id"),
		address: text("address"),
		latitude: real("latitude"),
		longitude: real("longitude"),
		midweekMeetingDay: integer("midweek_meeting_day"),
		midweekMeetingTime: text("midweek_meeting_time"),
		weekendMeetingDay: integer("weekend_meeting_day"),
		weekendMeetingTime: text("weekend_meeting_time"),
		jwSyncedAt: integer("jw_synced_at", { mode: "timestamp" }),
		// Origen del fork desplegado de esa congregación (ver migración 0042).
		forkUrl: text("fork_url"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("speaker_congregations_name_idx").on(t.name),
		uniqueIndex("speaker_congregations_jw_event_idx").on(t.jwEventId),
		uniqueIndex("speaker_congregations_fork_url_idx").on(t.forkUrl),
	],
);

// Catálogo del formulario S-99a — número, categoría y título de cada bosquejo
// de discurso público. Importable desde el EPUB oficial o agregado a mano,
// siempre con esta misma estructura de 3 campos.
export const publicTalkOutlines = sqliteTable(
	"public_talk_outlines",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		number: integer("number").notNull(),
		category: text("category").notNull(),
		title: text("title").notNull(),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [uniqueIndex("public_talk_outlines_number_idx").on(t.number)],
);

// Un orador local referencia un publicador existente (nombre/teléfono nunca
// se duplican, siempre se leen de `users`); uno visitante trae su propio
// nombre/teléfono/congregación. Ver el CHECK equivalente en la migración.
export const speakers = sqliteTable(
	"speakers",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kind: text("kind", { enum: SPEAKER_KINDS }).notNull(),
		userId: text("user_id").references(() => users.id),
		fullName: text("full_name"),
		phone: text("phone"),
		congregationId: text("congregation_id").references(() => speakerCongregations.id),
		notes: text("notes"),
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [uniqueIndex("speakers_user_idx").on(t.userId)],
);

// Repertorio de un orador: qué bosquejos tiene registrados a su nombre — es lo
// que filtra el dropdown de "Bosquejo" en el planificador de fin de semana.
export const speakerOutlines = sqliteTable(
	"speaker_outlines",
	{
		speakerId: text("speaker_id")
			.notNull()
			.references(() => speakers.id, { onDelete: "cascade" }),
		outlineId: text("outline_id")
			.notNull()
			.references(() => publicTalkOutlines.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.speakerId, t.outlineId] })],
);

export const ARRANGEMENT_DIRECTIONS = ["outgoing", "incoming"] as const;
export const ARRANGEMENT_STATUSES = ["planned", "pending", "accepted", "rejected", "counter"] as const;

// Arreglos de discursos por mes con otra congregación (ver migración 0042).
export const talkArrangements = sqliteTable(
	"talk_arrangements",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		congregationId: text("congregation_id")
			.notNull()
			.references(() => speakerCongregations.id, { onDelete: "cascade" }),
		direction: text("direction", { enum: ARRANGEMENT_DIRECTIONS }).notNull(),
		year: integer("year").notNull(),
		month: integer("month").notNull(),
		status: text("status", { enum: ARRANGEMENT_STATUSES }).notNull().default("planned"),
		proposedYear: integer("proposed_year"),
		proposedMonth: integer("proposed_month"),
		requestId: text("request_id"),
		speakersSyncedAt: integer("speakers_synced_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("talk_arrangements_month_idx").on(t.congregationId, t.year, t.month),
		uniqueIndex("talk_arrangements_request_idx").on(t.requestId),
	],
);
