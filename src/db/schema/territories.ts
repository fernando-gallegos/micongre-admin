import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { notifications } from "./notifications";
import { users } from "./users";

export const TERRITORY_KINDS = ["general", "public_preaching"] as const;
export const TERRITORY_ASSIGNMENT_STATUSES = ["assigned", "completed", "returned"] as const;

// Un territorio de predicación. mapData es un GeoJSON FeatureCollection
// serializado (polígonos, líneas, puntos y textos dibujados sobre el mapa
// base); los textos son Point con properties.kind = "text". null = sin dibujar.
export const territories = sqliteTable(
	"territories",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		number: text("number").notNull(),
		kind: text("kind", { enum: TERRITORY_KINDS }).notNull().default("general"),
		name: text("name"),
		notes: text("notes"),
		mapData: text("map_data"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [uniqueIndex("territories_number_idx").on(t.number)],
);

// Cada asignación de un territorio a un encargado. A lo más una vigente
// (status = "assigned") por territorio; al completarla o devolverla queda de
// historial con resolvedAt y el comentario opcional del encargado.
export const territoryAssignments = sqliteTable(
	"territory_assignments",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		territoryId: text("territory_id")
			.notNull()
			.references(() => territories.id, { onDelete: "cascade" }),
		assigneeUserId: text("assignee_user_id")
			.notNull()
			.references(() => users.id),
		assignedByUserId: text("assigned_by_user_id")
			.notNull()
			.references(() => users.id),
		assignedAt: integer("assigned_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		status: text("status", { enum: TERRITORY_ASSIGNMENT_STATUSES }).notNull().default("assigned"),
		resolvedAt: integer("resolved_at", { mode: "timestamp" }),
		resolutionComment: text("resolution_comment"),
		notificationId: text("notification_id").references(() => notifications.id, { onDelete: "set null" }),
		notifiedAt: integer("notified_at", { mode: "timestamp" }),
	},
	(t) => [
		index("territory_assignments_territory_idx").on(t.territoryId),
		index("territory_assignments_assignee_idx").on(t.assigneeUserId, t.status),
		uniqueIndex("territory_assignments_active_idx")
			.on(t.territoryId)
			.where(sql`${t.status} = 'assigned'`),
	],
);
