import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const ASSISTANCE_TYPES = ["MEDICAL_HLC", "MATERIAL_AID", "REMOTE_CONNECTION", "OTHER"] as const;
export const ASSISTANCE_STATUSES = ["RECEIVED", "UNDER_EVALUATION", "IN_PROGRESS", "RESOLVED"] as const;

// "pending" cubre tanto sin asignar como asignado-pero-todavía-no-atendido —
// solo los 2 ancianos asignados pueden moverla a uno de los 3 estados
// finales (ver api/pastoral/visit-requests/[id]/status/route.ts).
export const VISIT_REQUEST_STATUSES = ["pending", "completed", "cancelled", "postponed"] as const;

// Confidencialidad de 3 niveles (ver plan): visible por defecto solo al
// comité de servicio (cobe/secretario/superintendente de servicio) y a los
// ancianos en eldersAssigned; visibleToAllElders lo abre a cualquier anciano
// activo. Solo el comité puede prender ese interruptor.
export const shepherdingVisits = sqliteTable(
	"shepherding_visits",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		publisherId: text("publisher_id")
			.notNull()
			.references(() => users.id),
		dateVisited: text("date_visited").notNull(),
		// JSON: array de userIds de los ancianos que participaron.
		eldersAssigned: text("elders_assigned").notNull(),
		scripturesConsidered: text("scriptures_considered"),
		followUpNeeded: integer("follow_up_needed", { mode: "boolean" }).notNull().default(false),
		confidentialNotes: text("confidential_notes"),
		visibleToAllElders: integer("visible_to_all_elders", { mode: "boolean" }).notNull().default(false),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("shepherding_visits_publisher_idx").on(t.publisherId)],
);

// Señal ligera y no confidencial: el superintendente/auxiliar de un grupo de
// servicio marca a alguien de SU grupo para que el cuerpo de ancianos lo
// tenga presente (luto, dificultad familiar aguda, sfg 2:4) — no requiere
// que ya se haya hecho una visita.
export const pastoralFlags = sqliteTable(
	"pastoral_flags",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		publisherId: text("publisher_id")
			.notNull()
			.references(() => users.id),
		flaggedByUserId: text("flagged_by_user_id")
			.notNull()
			.references(() => users.id),
		reason: text("reason").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		resolvedAt: integer("resolved_at", { mode: "timestamp" }),
	},
	(t) => [index("pastoral_flags_publisher_idx").on(t.publisherId, t.resolvedAt)],
);

export const assistanceRequests = sqliteTable(
	"assistance_requests",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		publisherId: text("publisher_id")
			.notNull()
			.references(() => users.id),
		type: text("type", { enum: ASSISTANCE_TYPES }).notNull(),
		requestDate: text("request_date").notNull(),
		status: text("status", { enum: ASSISTANCE_STATUSES }).notNull().default("RECEIVED"),
		// JSON: array de userIds de los ancianos asignados a gestionarla.
		assignedElders: text("assigned_elders"),
		resolutionSummary: text("resolution_summary"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("assistance_requests_publisher_idx").on(t.publisherId, t.status)],
);

// Solicitud de pastoreo hecha por el propio publicador desde Mi Panel (a
// diferencia de shepherding_visits, que registra una visita ya hecha). Antes
// de asignar ancianos, la solicitud es visible para el comité de servicio
// (cobe/secretario/superintendente de servicio, ver isServiceCommitteeMember);
// una vez asignados los 2 ancianos, deja de aparecer para el comité y pasa a
// aparecer solo para esos 2 ancianos — ver src/lib/queries/panel.ts. Del lado
// del propio solicitante (api/pastoral/visit-requests/mine), también deja de
// listarse en cuanto status pasa de "pending" a un estado final.
export const shepherdingVisitRequests = sqliteTable(
	"shepherding_visit_requests",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		publisherId: text("publisher_id")
			.notNull()
			.references(() => users.id),
		requestedDate: text("requested_date").notNull(),
		notes: text("notes"),
		// JSON: array de exactamente 2 userIds de ancianos, null mientras está
		// pendiente de asignar.
		assignedElders: text("assigned_elders"),
		status: text("status", { enum: VISIT_REQUEST_STATUSES }).notNull().default("pending"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("shepherding_visit_requests_publisher_idx").on(t.publisherId)],
);
