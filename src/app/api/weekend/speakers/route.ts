import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations, speakerOutlines, speakers, talkArrangements, users, weekendMeetings } from "@/db/schema";
import { mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { createSpeakerSchema } from "@/lib/validation/speakers";

async function listSpeakers(db: ReturnType<typeof getDb>) {
	const [rows, outlineRows] = await Promise.all([
		db
			.select({
				id: speakers.id,
				kind: speakers.kind,
				userId: speakers.userId,
				fullName: sql<string>`coalesce(${users.fullName}, ${speakers.fullName})`,
				phone: sql<string | null>`coalesce(${users.phone}, ${speakers.phone})`,
				congregationId: speakers.congregationId,
				congregationName: speakerCongregations.name,
				active: speakers.active,
			})
			.from(speakers)
			.leftJoin(users, eq(users.id, speakers.userId))
			.leftJoin(speakerCongregations, eq(speakerCongregations.id, speakers.congregationId)),
		db
			.select({ speakerId: speakerOutlines.speakerId, outlineId: speakerOutlines.outlineId, songNumber: speakerOutlines.songNumber })
			.from(speakerOutlines),
	]);

	const outlineIdsBySpeaker = new Map<string, string[]>();
	const songsBySpeaker = new Map<string, Record<string, number>>();
	for (const row of outlineRows) {
		const list = outlineIdsBySpeaker.get(row.speakerId) ?? [];
		list.push(row.outlineId);
		outlineIdsBySpeaker.set(row.speakerId, list);
		if (row.songNumber != null) {
			const map = songsBySpeaker.get(row.speakerId) ?? {};
			map[row.outlineId] = row.songNumber;
			songsBySpeaker.set(row.speakerId, map);
		}
	}
	return rows.map((row) => ({ ...row, outlineIds: outlineIdsBySpeaker.get(row.id) ?? [], outlineSongs: songsBySpeaker.get(row.id) ?? {} }));
}

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const { searchParams } = new URL(request.url);
		const search = searchParams.get("search")?.trim();
		const kind = searchParams.get("kind");
		const forAssignment = searchParams.get("forAssignment") === "true";
		const meetingId = searchParams.get("meetingId");

		const db = getDb();
		let items = await listSpeakers(db);

		if (forAssignment) {
			const eligibleLocalIds = new Set(
				(await getEligiblePublishers(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER)).map((u) => u.id),
			);
			// La marca de activo es de los discursos que SALEN: al preparar la reunión propia (`meetingId`), un orador local siempre se considera activo.
			items = items.filter(
				(s) => (s.active || (!!meetingId && s.kind === "local")) && (s.kind === "visiting" || (s.userId && eligibleLocalIds.has(s.userId))),
			);

			// Al preparar una reunión, los oradores visitantes son solo los de las congregaciones con las que hay un arreglo de discursos para el mes al que
			// pertenece el primer día (lunes) de la semana que se prepara (los rechazados o con otro mes propuesto no cuentan); los locales siempre. Sin ningún arreglo ese mes, se ofrecen todos. El orador ya asignado se conserva en la lista.
			if (meetingId) {
				const [meeting] = await db
					.select({ date: weekendMeetings.meetingDate, speakerId: weekendMeetings.speakerId })
					.from(weekendMeetings)
					.where(eq(weekendMeetings.id, meetingId))
					.limit(1);
				if (meeting) {
					// El mes es el del primer día (lunes) de la semana que se está preparando, no el del sábado.
					const real = toISODate(mondayOf(parseISODate(meeting.date)));
					const arranged = await db
						.select({ congregationId: talkArrangements.congregationId })
						.from(talkArrangements)
						.where(and(eq(talkArrangements.year, Number(real.slice(0, 4))), eq(talkArrangements.month, Number(real.slice(5, 7))), inArray(talkArrangements.status, ["planned", "pending", "accepted"])));
					const congregationIds = new Set(arranged.map((a) => a.congregationId));
					// Si ese mes no hay ningún arreglo, no se filtra: se ofrecen todos los oradores (visitantes y locales).
					if (congregationIds.size > 0) {
						items = items.filter((s) => s.kind === "local" || s.id === meeting.speakerId || (s.congregationId != null && congregationIds.has(s.congregationId)));
					}
				}
			}
		}
		if (kind === "local" || kind === "visiting") {
			items = items.filter((s) => s.kind === kind);
		}
		if (search) {
			const needle = search.toLowerCase();
			items = items.filter((s) => s.fullName?.toLowerCase().includes(needle));
		}

		items.sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = createSpeakerSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { outlineIds, outlineSongs, ...data } = parsed.data;
		const db = getDb();

		if (data.kind === "local") {
			await assertEligibleForAssignment(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER, data.userId);
			const [existing] = await db.select().from(speakers).where(eq(speakers.userId, data.userId)).limit(1);
			if (existing) {
				return NextResponse.json({ error: "already_registered" }, { status: 409 });
			}
		}

		const [speaker] = await db.insert(speakers).values(data).returning();
		if (outlineIds.length > 0) {
			await db
				.insert(speakerOutlines)
				.values(outlineIds.map((outlineId) => ({ speakerId: speaker.id, outlineId, songNumber: outlineSongs?.[outlineId] ?? null })));
		}

		return NextResponse.json({ speaker }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
