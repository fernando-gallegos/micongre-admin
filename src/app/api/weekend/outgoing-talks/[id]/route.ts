import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { outgoingTalks, speakers } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { RbacError } from "@/lib/rbac/errors";
import { updateOutgoingTalkSchema } from "@/lib/validation/outgoingTalks";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const parsed = updateOutgoingTalkSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		if (parsed.data.speakerId) {
			const [speaker] = await db.select().from(speakers).where(eq(speakers.id, parsed.data.speakerId)).limit(1);
			if (!speaker || speaker.kind !== "local" || !speaker.userId) {
				throw new RbacError("El orador enviado a otra congregación debe ser un orador local.");
			}
			await assertEligibleForAssignment(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER, speaker.userId);
		}

		await db.update(outgoingTalks).set(parsed.data).where(eq(outgoingTalks.id, id));

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
		await db.delete(outgoingTalks).where(eq(outgoingTalks.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
