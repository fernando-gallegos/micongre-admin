import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

/** Novedades que cada persona ya vio (y cerró): no se le vuelven a mostrar. El contenido vive en `lib/announcements/catalog.ts`. */
export const announcementViews = sqliteTable(
	"announcement_views",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		announcementId: text("announcement_id").notNull(),
		seenAt: integer("seen_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [primaryKey({ columns: [t.userId, t.announcementId] })],
);
