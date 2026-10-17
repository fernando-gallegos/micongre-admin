import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { invalidBody, territoryErrorResponse } from "@/lib/territories/http";
import { resolveAssignment } from "@/lib/territories/service";
import { resolveAssignmentSchema } from "@/lib/validation/territories";
import { rememberOperation, replayIfProcessed } from "@/lib/http/idempotency";

// El encargado completa o devuelve su territorio (Mi Panel). Solo él puede:
// ni siquiera un admin resuelve la asignación de otro.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const parsed = resolveAssignmentSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const db = getDb();
		// Reintento de la cola sin internet: si ya se procesó, no se vuelve a resolver (daría error por «ya no está vigente»).
		const replay = await replayIfProcessed(db, request, session.userId);
		if (replay) return replay;
		await resolveAssignment(db, id, session.userId, parsed.data.status, parsed.data.comment);
		await rememberOperation(db, request, session.userId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
