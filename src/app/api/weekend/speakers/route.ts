import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations, speakerOutlines, speakers, users } from "@/db/schema";
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
		db.select({ speakerId: speakerOutlines.speakerId, outlineId: speakerOutlines.outlineId }).from(speakerOutlines),
	]);

	const outlineIdsBySpeaker = new Map<string, string[]>();
	for (const row of outlineRows) {
		const list = outlineIdsBySpeaker.get(row.speakerId) ?? [];
		list.push(row.outlineId);
		outlineIdsBySpeaker.set(row.speakerId, list);
	}
	return rows.map((row) => ({ ...row, outlineIds: outlineIdsBySpeaker.get(row.id) ?? [] }));
}

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const { searchParams } = new URL(request.url);
		const search = searchParams.get("search")?.trim();
		const kind = searchParams.get("kind");
		const forAssignment = searchParams.get("forAssignment") === "true";

		const db = getDb();
		let items = await listSpeakers(db);

		if (forAssignment) {
			const eligibleLocalIds = new Set(
				(await getEligiblePublishers(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER)).map((u) => u.id),
			);
			items = items.filter(
				(s) => s.active && (s.kind === "visiting" || (s.userId && eligibleLocalIds.has(s.userId))),
			);
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

		const { outlineIds, ...data } = parsed.data;
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
			await db.insert(speakerOutlines).values(outlineIds.map((outlineId) => ({ speakerId: speaker.id, outlineId })));
		}

		return NextResponse.json({ speaker }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
