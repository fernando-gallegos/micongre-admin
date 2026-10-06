import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { fieldServiceGroups } from "./fieldService";
import { users } from "./users";

// Evaluación de daños/necesidades tras un desastre, por grupo de servicio
// (sfg 11:5-7) — reportada hacia el COBE / superintendente de circuito.
export const disasterAssessmentRecords = sqliteTable("disaster_assessment_records", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	groupId: text("group_id")
		.notNull()
		.references(() => fieldServiceGroups.id),
	reportDate: text("report_date").notNull(),
	totalPublishersContacted: integer("total_publishers_contacted").notNull().default(0),
	injuredCount: integer("injured_count").notNull().default(0),
	missingCount: integer("missing_count").notNull().default(0),
	displacedCount: integer("displaced_count").notNull().default(0),
	deceasedCount: integer("deceased_count").notNull().default(0),
	housesDamagedCount: integer("houses_damaged_count").notNull().default(0),
	housesDestroyedCount: integer("houses_destroyed_count").notNull().default(0),
	utilitiesDisrupted: integer("utilities_disrupted", { mode: "boolean" }).notNull().default(false),
	urgentNeedsFoodWater: integer("urgent_needs_food_water", { mode: "boolean" }).notNull().default(false),
	urgentNeedsShelterClothing: integer("urgent_needs_shelter_clothing", { mode: "boolean" }).notNull().default(false),
	notes: text("notes"),
	reportedToCobe: integer("reported_to_cobe", { mode: "boolean" }).notNull().default(false),
	reportedToCircuitOverseer: integer("reported_to_circuit_overseer", { mode: "boolean" }).notNull().default(false),
	createdByUserId: text("created_by_user_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});
