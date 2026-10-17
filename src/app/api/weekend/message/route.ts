import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	outgoingTalks,
	publicTalkOutlines,
	songs,
	speakerCongregations,
	speakerOutlines,
	speakers,
	users,
	weekendMeetings,
	weekendMessageTemplates,
} from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { effectiveMeetingDate, type MeetingSchedules } from "@/lib/attendance/summary";
import { dayLabel, time12 } from "@/lib/export/builders/meetingDates";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { songLabel } from "@/lib/songs/label";
import { DEFAULT_TEMPLATES, renderTemplate, type MessageKind } from "@/lib/weekend/messageTemplate";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «sábado», «17 de octubre de 2026» a partir de la fecha ISO. */
function dateParts(iso: string): { dia: string; fecha: string } {
	const label = dayLabel(iso); // «sábado 17 de octubre de 2026»
	const [dia, ...rest] = label.split(" ");
	void MONTHS;
	return { dia, fecha: rest.join(" ") };
}

/** Texto del mensaje para un orador, con la plantilla guardada (o la de fábrica) y los datos de la reunión.
 * `kind=incoming&meetingId=…` (orador invitado que llega) o `kind=outgoing&outgoingId=…` (orador local que sale). */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { searchParams } = new URL(request.url);
		const kind = searchParams.get("kind") as MessageKind | null;
		if (kind !== "incoming" && kind !== "outgoing") return NextResponse.json({ error: "invalid_kind" }, { status: 400 });

		const db = getDb();
		const [cong] = await db
			.select({ name: congregations.name, address: congregations.kingdomHallAddress, schedules: congregations.meetingSchedules })
			.from(congregations)
			.where(eq(congregations.id, CONGREGATION_ROW_ID))
			.limit(1);
		let schedules: (MeetingSchedules & { weekend?: { day?: string; time?: string } | null }) | null = null;
		try {
			schedules = cong?.schedules ? JSON.parse(cong.schedules) : null;
		} catch {
			schedules = null;
		}
		const ourName = cong?.name ?? "";

		const [template] = await db.select().from(weekendMessageTemplates).where(eq(weekendMessageTemplates.kind, kind)).limit(1);
		const body = template?.body ?? DEFAULT_TEMPLATES[kind];

		const titles = new Map((await db.select().from(songs)).map((s) => [s.number, s.title]));
		let values: Record<string, string | null>;

		if (kind === "incoming") {
			const id = searchParams.get("meetingId");
			if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
			const [m] = await db
				.select({
					date: weekendMeetings.meetingDate,
					speaker: sql<string | null>`coalesce(${users.fullName}, ${speakers.fullName})`,
					congregation: speakerCongregations.name,
					number: publicTalkOutlines.number,
					title: publicTalkOutlines.title,
					song: speakerOutlines.songNumber,
				})
				.from(weekendMeetings)
				.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
				.leftJoin(users, eq(users.id, speakers.userId))
				.leftJoin(speakerCongregations, eq(speakerCongregations.id, speakers.congregationId))
				.leftJoin(publicTalkOutlines, eq(publicTalkOutlines.id, weekendMeetings.talkOutlineId))
				.leftJoin(
					speakerOutlines,
					sql`${speakerOutlines.speakerId} = ${weekendMeetings.speakerId} and ${speakerOutlines.outlineId} = ${weekendMeetings.talkOutlineId}`,
				)
				.where(eq(weekendMeetings.id, id))
				.limit(1);
			if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
			const date = effectiveMeetingDate(m.date, "weekend", schedules);
			values = {
				orador: m.speaker,
				congregacion_orador: m.congregation,
				congregacion_destino: ourName,
				...dateParts(date),
				hora: time12(schedules?.weekend?.time),
				bosquejo_numero: m.number != null ? String(m.number) : null,
				bosquejo_titulo: m.title,
				cancion: songLabel(m.song, titles),
				direccion: cong?.address ?? null,
			};
		} else {
			const id = searchParams.get("outgoingId");
			if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
			const [o] = await db
				.select({
					date: outgoingTalks.meetingDate,
					time: outgoingTalks.meetingTime,
					speaker: users.fullName,
					destination: speakerCongregations.name,
					address: speakerCongregations.address,
					number: publicTalkOutlines.number,
					title: publicTalkOutlines.title,
					song: speakerOutlines.songNumber,
				})
				.from(outgoingTalks)
				.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
				.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
				.innerJoin(users, eq(users.id, speakers.userId))
				.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
				.leftJoin(
					speakerOutlines,
					sql`${speakerOutlines.speakerId} = ${outgoingTalks.speakerId} and ${speakerOutlines.outlineId} = ${outgoingTalks.talkOutlineId}`,
				)
				.where(eq(outgoingTalks.id, id))
				.limit(1);
			if (!o) return NextResponse.json({ error: "not_found" }, { status: 404 });
			values = {
				orador: o.speaker,
				congregacion_orador: ourName,
				congregacion_destino: o.destination,
				...dateParts(o.date),
				hora: time12(o.time),
				bosquejo_numero: String(o.number),
				bosquejo_titulo: o.title,
				cancion: songLabel(o.song, titles),
				direccion: o.address,
			};
		}

		return NextResponse.json({ text: renderTemplate(body, values) });
	} catch (error) {
		return errorResponse(error);
	}
}
