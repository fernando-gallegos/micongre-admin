import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// Claves de idempotencia de las escrituras que la app Android guarda sin internet y envía después (ver lib/http/idempotency.ts).
export const processedOperations = sqliteTable(
	"processed_operations",
	{
		opKey: text("op_key").primaryKey(),
		userId: text("user_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("processed_operations_created_idx").on(t.createdAt)],
);

// «¿Olvidaste tu contraseña?»: solo para limitar solicitudes por persona y por IP (hash); se borran a los 30 días (ver lib/auth/passwordHelp.ts).
export const passwordHelpRequests = sqliteTable(
	"password_help_requests",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		ipHash: text("ip_hash").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("password_help_requests_user_idx").on(t.userId, t.createdAt), index("password_help_requests_ip_idx").on(t.ipHash, t.createdAt)],
);
