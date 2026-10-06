import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	label: text("label").notNull(),
});
