import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
