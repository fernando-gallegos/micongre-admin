import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ANIMATION_FOLDERS } from "@/lib/animations/folders";
import { users } from "./users";

// Animaciones Lottie de bienvenida (ver lib/animations y Congregación → Animaciones). El JSON completo vive en `data`; los listados
// nunca lo seleccionan (puede pesar cientos de KB).
export const welcomeAnimations = sqliteTable(
	"welcome_animations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		folder: text("folder", { enum: ANIMATION_FOLDERS }).notNull(),
		name: text("name").notNull(),
		data: text("data").notNull(),
		size: integer("size").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		durationMs: integer("duration_ms").notNull(),
		createdByUserId: text("created_by_user_id").references(() => users.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("welcome_animations_folder_idx").on(t.folder)],
);
