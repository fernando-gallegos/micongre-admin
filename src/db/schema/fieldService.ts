import { type AnySQLiteColumn, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// users.field_service_group_id referencia esta tabla (ver ./users.ts) — un
// publicador pertenece a lo sumo a un grupo, o a ninguno si aún no se asigna.
export const fieldServiceGroups = sqliteTable("field_service_groups", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text("name").notNull(),
	overseerUserId: text("overseer_user_id").references((): AnySQLiteColumn => users.id),
	assistantUserId: text("assistant_user_id").references((): AnySQLiteColumn => users.id),
	// Dirección habitual o enlace de Zoom, sfg 3:3.
	regularMeetingPlace: text("regular_meeting_place"),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	// Hex "#rrggbb", opcional — para pintar el nombre del grupo como badge en
	// cualquier lugar donde se muestre (publicadores, Mi Panel, etc.).
	color: text("color"),
});
