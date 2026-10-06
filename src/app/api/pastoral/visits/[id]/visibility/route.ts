import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisits } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAccessPastoralDashboard, isServiceCommitteeMember } from "@/lib/rbac/guards";
import { updateVisitVisibilitySchema } from "@/lib/validation/pastoralCare";

// Único endpoint que puede abrir una visita a todos los ancianos — solo el
// comité de servicio (cobe/secretario/superintendente de servicio) o admin,
// nunca el anciano que hizo la visita por sí solo.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);
		const { id } = await params;

		const db = getDb();
		if (session.role !== "admin") {
			const isCommittee = await isServiceCommitteeMember(db, session.userId);
			if (!isCommittee) throw new RbacError("Solo el comité de servicio puede cambiar la visibilidad.");
		}

		const parsed = updateVisitVisibilitySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		await db.update(shepherdingVisits).set(parsed.data).where(eq(shepherdingVisits.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
