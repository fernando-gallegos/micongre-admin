import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningCongregations, cleaningTaskAssignees } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse, invalidBody } from "@/lib/cleaning/http";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";
import { updateHallCongregationSchema } from "@/lib/validation/cleaning";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);
		const { id } = await params;

		const parsed = updateHallCongregationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);
		if (Object.keys(parsed.data).length === 0) return NextResponse.json({ ok: true });

		const updated = await getDb()
			.update(cleaningCongregations)
			.set(parsed.data)
			.where(eq(cleaningCongregations.id, id))
			.returning({ id: cleaningCongregations.id });
		if (updated.length === 0) return NextResponse.json({ error: "congregation_not_found" }, { status: 404 });
		return NextResponse.json({ ok: true });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}

// Una congregación que ya figura como responsable en alguna tarea no se borra
// (se perdería ese historial): se desactiva con PATCH active=false.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);
		const { id } = await params;

		const db = getDb();
		const [used] = await db
			.select({ id: cleaningTaskAssignees.id })
			.from(cleaningTaskAssignees)
			.where(eq(cleaningTaskAssignees.congregationId, id))
			.limit(1);
		if (used) return NextResponse.json({ error: "in_use" }, { status: 409 });

		await db.delete(cleaningCongregations).where(eq(cleaningCongregations.id, id));
		return NextResponse.json({ ok: true });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
