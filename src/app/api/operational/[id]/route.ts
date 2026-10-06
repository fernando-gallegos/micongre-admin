import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { operationalSchedules } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { checkOperationalCollisions } from "@/lib/collision";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessOperationalModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { assignOperationalSlotSchema } from "@/lib/validation/operational";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);
		const { id } = await params;

		const parsed = assignOperationalSlotSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		const [slot] = await db.select().from(operationalSchedules).where(eq(operationalSchedules.id, id)).limit(1);
		if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });

		let warnings: string[] = [];
		if (parsed.data.assignedUserId) {
			await assertEligibleForAssignment(db, slot.privilegeId, parsed.data.assignedUserId);
			warnings = await checkOperationalCollisions(
				db,
				slot.meetingType,
				slot.meetingId,
				parsed.data.assignedUserId,
				slot.id,
			);
		}

		await db.update(operationalSchedules).set(parsed.data).where(eq(operationalSchedules.id, id));

		return NextResponse.json({ ok: true, warnings });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);
		const { id } = await params;

		const db = getDb();
		await db.delete(operationalSchedules).where(eq(operationalSchedules.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
