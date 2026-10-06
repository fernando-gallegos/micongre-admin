import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { outgoingTalks, publicTalkOutlines, speakerCongregations, speakers, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { notifyUser } from "@/lib/push/dispatch";
import { assertCanAccessWeekendModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { RbacError } from "@/lib/rbac/errors";
import { createOutgoingTalkSchema } from "@/lib/validation/outgoingTalks";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const { searchParams } = new URL(request.url);
		const from = searchParams.get("from");
		const to = searchParams.get("to");

		const conditions = [];
		if (from) conditions.push(gte(outgoingTalks.meetingDate, from));
		if (to) conditions.push(lte(outgoingTalks.meetingDate, to));

		const db = getDb();
		const rows = await db
			.select({
				id: outgoingTalks.id,
				meetingDate: outgoingTalks.meetingDate,
				meetingTime: outgoingTalks.meetingTime,
				congregationId: outgoingTalks.congregationId,
				congregationName: speakerCongregations.name,
				speakerId: outgoingTalks.speakerId,
				speakerName: users.fullName,
				talkOutlineId: outgoingTalks.talkOutlineId,
				talkOutlineNumber: publicTalkOutlines.number,
				talkOutlineTitle: publicTalkOutlines.title,
			})
			.from(outgoingTalks)
			.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
			.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
			.innerJoin(users, eq(users.id, speakers.userId))
			.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(asc(outgoingTalks.meetingDate), asc(outgoingTalks.meetingTime));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = createOutgoingTalkSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [speaker] = await db.select().from(speakers).where(eq(speakers.id, parsed.data.speakerId)).limit(1);
		if (!speaker || speaker.kind !== "local" || !speaker.userId) {
			throw new RbacError("El orador enviado a otra congregación debe ser un orador local.");
		}
		await assertEligibleForAssignment(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER, speaker.userId);

		const [talk] = await db.insert(outgoingTalks).values(parsed.data).returning({ id: outgoingTalks.id });

		const [congregation] = await db
			.select({ name: speakerCongregations.name })
			.from(speakerCongregations)
			.where(eq(speakerCongregations.id, parsed.data.congregationId))
			.limit(1);
		await notifyUser(db, speaker.userId, {
			title: "Se te asignó un discurso en otra congregación",
			body: `${congregation?.name ?? "Congregación"} — ${parsed.data.meetingDate}`,
			url: "/panel",
		});

		return NextResponse.json({ id: talk.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
