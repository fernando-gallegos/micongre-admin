import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { fieldServiceGroups } from "./fieldService";
import { territories } from "./territories";
import { users } from "./users";

export const PREACHING_TARGET_TYPES = ["congregation", "group", "publisher"] as const;

// Una salida de predicación: fecha, hora y nota, sobre uno o varios territorios ya asignados (todos del mismo tipo).
export const preachingSessions = sqliteTable(
	"preaching_sessions",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sessionDate: text("session_date").notNull(),
		sessionTime: text("session_time").notNull(),
		note: text("note"),
		kind: text("kind", { enum: ["general", "public_preaching"] }).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		// JSON con los ids de los avisos generados.
		notificationIds: text("notification_ids"),
		notifiedAt: integer("notified_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("preaching_sessions_date_idx").on(t.sessionDate)],
);

export const preachingSessionTerritories = sqliteTable(
	"preaching_session_territories",
	{
		sessionId: text("session_id")
			.notNull()
			.references(() => preachingSessions.id, { onDelete: "cascade" }),
		territoryId: text("territory_id")
			.notNull()
			.references(() => territories.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.sessionId, t.territoryId] }), index("preaching_session_territories_territory_idx").on(t.territoryId)],
);

// A quién se asigna: toda la congregación, uno o varios grupos (territorios generales) o varios publicadores (predicación pública).
export const preachingSessionTargets = sqliteTable(
	"preaching_session_targets",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sessionId: text("session_id")
			.notNull()
			.references(() => preachingSessions.id, { onDelete: "cascade" }),
		targetType: text("target_type", { enum: PREACHING_TARGET_TYPES }).notNull(),
		groupId: text("group_id").references(() => fieldServiceGroups.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("preaching_session_targets_session_idx").on(t.sessionId),
		index("preaching_session_targets_user_idx").on(t.userId),
		index("preaching_session_targets_group_idx").on(t.groupId),
	],
);
