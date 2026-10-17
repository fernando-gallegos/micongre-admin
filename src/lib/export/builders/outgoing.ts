import { and, asc, eq, gte, lte } from "drizzle-orm";
import { outgoingTalks, publicTalkOutlines, speakerCongregations, speakers, users } from "@/db/schema";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import type { BuilderContext } from "../registry";
import type { ReportDoc } from "../types";
import { dayLabel, parseRange, time12 } from "./meetingDates";

/** Oradores salientes: los discursos que oradores locales dan en otras congregaciones (semana o mes). */
export async function buildOutgoing({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessWeekendModule(session);
	const range = parseRange(params, "week");

	const rows = await db
		.select({
			date: outgoingTalks.meetingDate,
			time: outgoingTalks.meetingTime,
			number: publicTalkOutlines.number,
			title: publicTalkOutlines.title,
			speaker: users.fullName,
			congregation: speakerCongregations.name,
		})
		.from(outgoingTalks)
		.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
		.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
		.innerJoin(users, eq(users.id, speakers.userId))
		.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
		.where(and(gte(outgoingTalks.meetingDate, range.from), lte(outgoingTalks.meetingDate, range.to)))
		.orderBy(asc(outgoingTalks.meetingDate), asc(outgoingTalks.meetingTime));

	return {
		title: "Oradores salientes",
		subtitle: range.label,
		fileName: `oradores-salientes-${range.slug}`,
		landscape: true,
		blocks: rows.length
			? [
					{
						type: "table",
						table: {
							sheetName: "Oradores salientes",
							columns: [
								{ label: "Día y hora", width: 2 },
								{ label: "N.º", width: 0.6, align: "center" },
								{ label: "Título del bosquejo", width: 3.4 },
								{ label: "Orador", width: 2 },
								{ label: "Congregación", width: 2.2 },
							],
							rows: rows.map((r) => {
								const time = time12(r.time);
								return [time ? `${dayLabel(r.date)}\n${time}` : dayLabel(r.date), r.number, r.title, r.speaker, r.congregation];
							}),
						},
					},
				]
			: [{ type: "paragraph", text: "No hay discursos enviados a otras congregaciones en este periodo.", muted: true }],
		footer: "Mi Congre",
	};
}
