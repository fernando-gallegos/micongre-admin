import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisits } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessPastoralDashboard, isServiceCommitteeMember } from "@/lib/rbac/guards";
import { RbacError } from "@/lib/rbac/errors";
import { updateVisitSchema } from "@/lib/validation/pastoralCare";

// Edición completa: admin, comité de servicio, o un anciano que conste en
// eldersAssigned de esa fila puntual.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);
		const { id } = await params;

		const db = getDb();
		const [existing] = await db
			.select({ eldersAssigned: shepherdingVisits.eldersAssigned })
			.from(shepherdingVisits)
			.where(eq(shepherdingVisits.id, id))
			.limit(1);
		if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const eldersAssigned = JSON.parse(existing.eldersAssigned) as string[];
		const isCommittee = session.role === "admin" ? true : await isServiceCommitteeMember(db, session.userId);
		if (session.role !== "admin" && !isCommittee && !eldersAssigned.includes(session.userId)) {
			throw new RbacError("No participaste en esta visita ni eres del comité de servicio.");
		}

		const parsed = updateVisitSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { eldersAssigned: newElders, ...rest } = parsed.data;
		await db
			.update(shepherdingVisits)
			.set({ ...rest, ...(newElders !== undefined ? { eldersAssigned: JSON.stringify(newElders) } : {}) })
			.where(eq(shepherdingVisits.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
