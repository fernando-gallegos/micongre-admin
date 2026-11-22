import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { chunked } from "@/lib/cleaning/meetings";
import { addDays, issueCodeForWeek, parseISODate, toISODate, weekStartsOfMonth } from "@/lib/mwb/dates";
import { fetchMwbEpub, MwbFetchError } from "@/lib/mwb/fetchEpub";
import { parseWeekPrograms } from "@/lib/mwb/parseProgram";
import { mwbLinkFields, programRows, ROWS_PER_INSERT } from "@/lib/mwb/programRows";
import { applyProgramToMeeting } from "@/lib/mwb/applyProgram";
import { importMidweekProgramSchema } from "@/lib/validation/midweek";
import { ensureSongsCatalog } from "@/lib/songs/catalog";

type WeekAction = "created" | "replaced" | "updated" | "not_found";

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);

		const parsed = importMidweekProgramSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const { weekStart } = parsed.data;
		const weekStarts = weekStartsOfMonth(weekStart);
		// Las canciones de la guía se guardan por número; el título sale del catálogo (se baja solo si falta).
		await ensureSongsCatalog(getDb());

		let epubBytes: ArrayBuffer;
		try {
			epubBytes = await fetchMwbEpub(issueCodeForWeek(weekStart));
		} catch (fetchError) {
			const message =
				fetchError instanceof MwbFetchError ? fetchError.message : "No se pudo contactar a JW.ORG.";
			return NextResponse.json({ error: "upstream_error", message }, { status: 502 });
		}

		const programs = parseWeekPrograms(epubBytes, weekStarts);
		if (programs.size === 0) {
			return NextResponse.json({ error: "week_not_found" }, { status: 404 });
		}

		const db = getDb();
		const monthMeetings = await db
			.select()
			.from(midweekMeetings)
			.where(
				and(
					gte(midweekMeetings.meetingDate, weekStarts[0]),
					lte(midweekMeetings.meetingDate, toISODate(addDays(parseISODate(weekStarts[weekStarts.length - 1]), 6))),
				),
			);
		const meetingIds = monthMeetings.map((m) => m.id);
		const existingAssignments = meetingIds.length
			? await db.select().from(midweekAssignments).where(inArray(midweekAssignments.meetingId, meetingIds))
			: [];

		const weeks: { weekStart: string; weekLabel: string | null; action: WeekAction }[] = [];

		for (const monday of weekStarts) {
			const program = programs.get(monday);
			if (!program) {
				weeks.push({ weekStart: monday, weekLabel: null, action: "not_found" });
				continue;
			}

			const sunday = toISODate(addDays(parseISODate(monday), 6));
			const existing = monthMeetings.find((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
			const rows = programRows(program);
			const meetingFields = {
				weekLabel: program.weekLabel,
				openingSongNumber: program.openingSongNumber,
				closingSongNumber: program.closingSongNumber,
				middleSongNumber: program.middleSongNumber,
				studyLessonReference: program.cbs.title,
				...mwbLinkFields(program),
			};

			if (!existing) {
				const [meeting] = await db
					.insert(midweekMeetings)
					.values({ meetingDate: monday, ...meetingFields })
					.returning({ id: midweekMeetings.id });
				for (const chunk of chunked(rows, ROWS_PER_INSERT)) {
					await db.insert(midweekAssignments).values(chunk.map((row) => ({ ...row, meetingId: meeting.id })));
				}
				weeks.push({ weekStart: monday, weekLabel: program.weekLabel, action: "created" });
				continue;
			}

			// Ya existe: se deja igual que la guía (títulos, canciones, partes, enlaces) sin cambiar a nadie de su asignación.
			const current = existingAssignments.filter((a) => a.meetingId === existing.id);
			await applyProgramToMeeting(db, existing, current, program);
			weeks.push({ weekStart: monday, weekLabel: program.weekLabel, action: "updated" });
		}

		return NextResponse.json({ weeks });
	} catch (error) {
		return errorResponse(error);
	}
}
