import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const CLIENT_TYPES = ["web", "mobile"] as const;

export const refreshTokens = sqliteTable(
	"refresh_tokens",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// SHA-256 del token opaco; el token en claro nunca se guarda.
		tokenHash: text("token_hash").notNull(),
		clientType: text("client_type", { enum: CLIENT_TYPES }).notNull().default("web"),
		issuedAt: integer("issued_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		// Techo que sobrevive a la rotación (a diferencia de expiresAt, que se
		// vuelve a fijar en cada refresh con una ventana deslizante) — solo lo
		// usa el acceso de visita del SC, para que ninguna rotación pueda
		// extender la sesión más allá de co_visit_schedules.endDate. null para
		// toda sesión normal (ventana deslizante sin techo).
		capExpiresAt: integer("cap_expires_at", { mode: "timestamp" }),
		revokedAt: integer("revoked_at", { mode: "timestamp" }),
		replacedByTokenId: text("replaced_by_token_id"),
		userAgent: text("user_agent"),
		ipHash: text("ip_hash"),
	},
	(t) => [
		uniqueIndex("refresh_token_hash_idx").on(t.tokenHash),
		index("refresh_user_idx").on(t.userId, t.revokedAt),
	],
);

// circuit_overseer_visit: enlace de acceso temporal para la visita del SC —
// ver src/lib/auth/activation.ts, su expiresAt se ancla a co_visit_schedules.endDate.
export const ACTIVATION_PURPOSES = ["initial_setup", "password_reset", "circuit_overseer_visit"] as const;

export const accountActivationTokens = sqliteTable(
	"account_activation_tokens",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// SHA-256 del token opaco que va en el enlace; el token en claro solo
		// existe en la URL entregada al publicador, nunca se persiste.
		tokenHash: text("token_hash").notNull(),
		purpose: text("purpose", { enum: ACTIVATION_PURPOSES }).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => users.id),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		// null = aún no canjeado
		usedAt: integer("used_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		uniqueIndex("activation_token_hash_idx").on(t.tokenHash),
		index("activation_user_idx").on(t.userId, t.usedAt),
	],
);
