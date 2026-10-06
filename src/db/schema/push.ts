import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// Una fila por navegador suscrito (no por usuario) — la misma persona puede
// tener varios dispositivos/navegadores activos a la vez.
export const pushSubscriptions = sqliteTable(
	"push_subscriptions",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		authKey: text("auth_key").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
		index("push_subscriptions_user_idx").on(t.userId),
	],
);

// Una fila por dispositivo Android con la app (token de Firebase Cloud Messaging). Solo se usa cuando el sitio tiene
// configurada la cuenta de servicio de Firebase (FCM_SERVICE_ACCOUNT); ver docs/firebase-push.md.
export const deviceTokens = sqliteTable(
	"device_tokens",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		// Llave pública P-256 (65 bytes, base64url) del dispositivo: con ella el servidor cifra el push de punta a punta.
		publicKey: text("public_key"),
		platform: text("platform").notNull().default("android"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("device_tokens_user_token_idx").on(t.userId, t.token),
		index("device_tokens_token_idx").on(t.token),
		index("device_tokens_user_idx").on(t.userId),
	],
);
