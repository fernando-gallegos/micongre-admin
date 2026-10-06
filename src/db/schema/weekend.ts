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
		status: text("status", { enum: ["scheduled", "cancelled"] }).notNull().default("scheduled"),
		notes: text("notes"),
	},
	(t) => [uniqueIndex("weekend_date_idx").on(t.meetingDate)],
);

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
