import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { publicTalkOutlines, speakerCongregations, speakers } from "./speakers";

export const weekendMeetings = sqliteTable(
	"weekend_meetings",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingDate: text("meeting_date").notNull(),
		chairmanUserId: text("chairman_user_id").references(() => users.id),
		speakerId: text("speaker_id").references(() => speakers.id),
		talkOutlineId: text("talk_outline_id").references(() => publicTalkOutlines.id),
		watchtowerConductorId: text("watchtower_conductor_id").references(() => users.id),
		watchtowerReaderId: text("watchtower_reader_id").references(() => users.id),
		prayerUserId: text("prayer_user_id").references(() => users.id),
		// Canciones de la reunión (números del catálogo `songs`): la de La Atalaya y la final.
		// 1 = la reunión empieza con La Atalaya y el discurso público va después.
		watchtowerFirst: integer("watchtower_first", { mode: "boolean" }).notNull().default(false),
		watchtowerTitle: text("watchtower_title"),
		watchtowerSongNumber: integer("watchtower_song_number"),
		closingSongNumber: integer("closing_song_number"),
		status: text("status", { enum: ["scheduled", "cancelled"] }).notNull().default("scheduled"),
		notes: text("notes"),
	},
	(t) => [uniqueIndex("weekend_date_idx").on(t.meetingDate)],
);

// Plantillas del mensaje para oradores (copiar y pegar en cualquier mensajería): `incoming` = invitado que llega, `outgoing` = local que sale.
export const weekendMessageTemplates = sqliteTable("weekend_message_templates", {
	kind: text("kind", { enum: ["incoming", "outgoing"] }).primaryKey(),
	body: text("body").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Discursos públicos que oradores locales dan en OTRA congregación (no la
// nuestra) — a diferencia de weekend_meetings, que es nuestra propia reunión,
// aquí puede haber más de uno en la misma fecha (varios oradores enviados el
// mismo fin de semana) y necesita su propia hora porque la reunión de la
// congregación destino puede no coincidir con la nuestra.
export const outgoingTalks = sqliteTable(
	"outgoing_talks",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		meetingDate: text("meeting_date").notNull(),
		meetingTime: text("meeting_time").notNull(),
		congregationId: text("congregation_id")
			.notNull()
			.references(() => speakerCongregations.id),
		speakerId: text("speaker_id")
			.notNull()
			.references(() => speakers.id),
		talkOutlineId: text("talk_outline_id")
			.notNull()
			.references(() => publicTalkOutlines.id),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [index("outgoing_talks_date_idx").on(t.meetingDate)],
);
