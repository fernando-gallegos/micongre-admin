import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publicTalkOutlines, speakerCongregations, speakers, users, weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES, PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { updateWeekendMeetingSchema } from "@/lib/validation/weekend";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Lectura abierta a toda persona con sesión; las notas internas solo para quien administra el módulo.
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const canSeeNotes = session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.WEEKEND_ACCESS);
		const { id } = await params;

		const db = getDb();
		const [meeting] = await db
			.select({
				id: weekendMeetings.id,
				meetingDate: weekendMeetings.meetingDate,
				chairmanUserId: weekendMeetings.chairmanUserId,
				speakerId: weekendMeetings.speakerId,
				talkOutlineId: weekendMeetings.talkOutlineId,
				watchtowerConductorId: weekendMeetings.watchtowerConductorId,
				watchtowerReaderId: weekendMeetings.watchtowerReaderId,
				prayerUserId: weekendMeetings.prayerUserId,
				status: weekendMeetings.status,
				notes: weekendMeetings.notes,
				speakerName: sql<string | null>`coalesce(${users.fullName}, ${speakers.fullName})`,
				speakerCongregationName: speakerCongregations.name,
				talkOutlineNumber: publicTalkOutlines.number,
				talkOutlineTitle: publicTalkOutlines.title,
			})
			.from(weekendMeetings)
			.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
			.leftJoin(users, eq(users.id, speakers.userId))
			.leftJoin(speakerCongregations, eq(speakerCongregations.id, speakers.congregationId))
			.leftJoin(publicTalkOutlines, eq(publicTalkOutlines.id, weekendMeetings.talkOutlineId))
			.where(eq(weekendMeetings.id, id))
			.limit(1);
		if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const roleIds = [meeting.chairmanUserId, meeting.watchtowerConductorId, meeting.watchtowerReaderId, meeting.prayerUserId].filter(
			(v): v is string => !!v,
		);
		const named = roleIds.length ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, roleIds)) : [];
		const nameOf = (id: string | null) => (id ? (named.find((u) => u.id === id)?.fullName ?? null) : null);

		return NextResponse.json({
			meeting: {
				...meeting,
				notes: canSeeNotes ? meeting.notes : null,
				chairmanName: nameOf(meeting.chairmanUserId),
				watchtowerConductorName: nameOf(meeting.watchtowerConductorId),
				watchtowerReaderName: nameOf(meeting.watchtowerReaderId),
				prayerName: nameOf(meeting.prayerUserId),
			},
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const parsed = updateWeekendMeetingSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const patch = { ...parsed.data };

		const [existing] = await db
			.select({ id: weekendMeetings.id })
			.from(weekendMeetings)
			.where(eq(weekendMeetings.id, id))
			.limit(1);
		if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

		// Revalida elegibilidad en el servidor para cada rol que se está fijando
		// — nunca confía en que la opción vino realmente del selector filtrado.
		const eligibilityChecks: Array<[string | null | undefined, string]> = [
			[patch.chairmanUserId, PRIVILEGE_IDS.WEEKEND_CHAIRMAN],
			[patch.watchtowerConductorId, PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR],
			[patch.watchtowerReaderId, PRIVILEGE_IDS.WATCHTOWER_READER],
			[patch.prayerUserId, PRIVILEGE_IDS.CONGREGATION_PRAYER],
		];
		for (const [userId, privilegeId] of eligibilityChecks) {
			if (userId) await assertEligibleForAssignment(db, privilegeId, userId);
		}

		// Un orador visitante no tiene privilegios que revalidar; uno local debe
		// seguir siendo elegible para el privilegio de orador de discurso público.
		if (patch.speakerId) {
			const [speaker] = await db.select().from(speakers).where(eq(speakers.id, patch.speakerId)).limit(1);
			if (!speaker) return NextResponse.json({ error: "speaker_not_found" }, { status: 400 });
			if (speaker.kind === "local" && speaker.userId) {
				await assertEligibleForAssignment(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER, speaker.userId);
			}
		}

		// Asignar no notifica: el push sale solo al presionar "Enviar" (ver
		// ./notify/route.ts).
		await db.update(weekendMeetings).set(patch).where(eq(weekendMeetings.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const db = getDb();
		await db.delete(weekendMeetings).where(eq(weekendMeetings.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
