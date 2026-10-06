import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations, speakerOutlines, speakers, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { updateSpeakerSchema } from "@/lib/validation/speakers";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const db = getDb();
		const [speaker] = await db
			.select({
				id: speakers.id,
				kind: speakers.kind,
				userId: speakers.userId,
				fullName: speakers.fullName,
				phone: speakers.phone,
				congregationId: speakers.congregationId,
				congregationName: speakerCongregations.name,
				notes: speakers.notes,
				active: speakers.active,
				localFullName: users.fullName,
				localPhone: users.phone,
			})
			.from(speakers)
			.leftJoin(users, eq(users.id, speakers.userId))
			.leftJoin(speakerCongregations, eq(speakerCongregations.id, speakers.congregationId))
			.where(eq(speakers.id, id))
			.limit(1);

		if (!speaker) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const outlineRows = await db
			.select({ outlineId: speakerOutlines.outlineId })
			.from(speakerOutlines)
			.where(eq(speakerOutlines.speakerId, id));

		return NextResponse.json({
			speaker: {
				...speaker,
				fullName: speaker.localFullName ?? speaker.fullName,
				phone: speaker.localPhone ?? speaker.phone,
				outlineIds: outlineRows.map((r) => r.outlineId),
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

		const parsed = updateSpeakerSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { outlineIds, ...patch } = parsed.data;
		const db = getDb();

		if (Object.keys(patch).length > 0) {
			await db.update(speakers).set(patch).where(eq(speakers.id, id));
		}
		if (outlineIds) {
			await db.delete(speakerOutlines).where(eq(speakerOutlines.speakerId, id));
			if (outlineIds.length > 0) {
				await db.insert(speakerOutlines).values(outlineIds.map((outlineId) => ({ speakerId: id, outlineId })));
			}
		}

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
		await db.delete(speakers).where(eq(speakers.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
