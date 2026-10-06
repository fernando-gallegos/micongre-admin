import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publicTalkOutlines, speakerOutlines, speakers, talkArrangements, users } from "@/db/schema";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";

// Público, pero sólo responde con un `requestId` de un arreglo ACEPTADO: devuelve
// los oradores locales habilitados (nombre y números de bosquejo, nada más).
export async function GET(request: Request) {
	const requestId = new URL(request.url).searchParams.get("requestId") ?? "";
	const db = getDb();

	const [arrangement] = requestId
		? await db
				.select({ id: talkArrangements.id })
				.from(talkArrangements)
				.where(and(eq(talkArrangements.requestId, requestId), eq(talkArrangements.status, "accepted")))
		: [];
	if (!arrangement) return NextResponse.json({ error: "not_found" }, { status: 404 });

	const eligibleIds = new Set((await getEligiblePublishers(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER)).map((u) => u.id));
	const [locals, outlineRows] = await Promise.all([
		db
			.select({ id: speakers.id, userId: speakers.userId, fullName: users.fullName })
			.from(speakers)
			.innerJoin(users, eq(users.id, speakers.userId))
			.where(and(eq(speakers.kind, "local"), eq(speakers.active, true))),
		db
			.select({ speakerId: speakerOutlines.speakerId, number: publicTalkOutlines.number })
			.from(speakerOutlines)
			.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, speakerOutlines.outlineId)),
	]);

	const numbersBySpeaker = new Map<string, number[]>();
	for (const row of outlineRows) numbersBySpeaker.set(row.speakerId, [...(numbersBySpeaker.get(row.speakerId) ?? []), row.number]);

	const items = locals
		.filter((s) => s.userId && eligibleIds.has(s.userId))
		.map((s) => ({ fullName: s.fullName, outlineNumbers: (numbersBySpeaker.get(s.id) ?? []).sort((a, b) => a - b) }))
		.sort((a, b) => a.fullName.localeCompare(b.fullName));

	return NextResponse.json({ items });
}
