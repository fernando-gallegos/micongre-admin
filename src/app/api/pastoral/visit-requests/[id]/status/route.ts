import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisitRequests } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { updateVisitRequestStatusSchema } from "@/lib/validation/pastoralCare";

// Solo los 2 ancianos asignados (o un admin) pueden mover el seguimiento —
// a diferencia de asignar, que es del comité de servicio.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const parsed = updateVisitRequestStatusSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [existing] = await db
			.select({
				assignedElders: shepherdingVisitRequests.assignedElders,
				publisherId: shepherdingVisitRequests.publisherId,
				notes: shepherdingVisitRequests.notes,
			})
			.from(shepherdingVisitRequests)
			.where(eq(shepherdingVisitRequests.id, id))
			.limit(1);
		if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const assignedElders = existing.assignedElders ? (JSON.parse(existing.assignedElders) as string[]) : [];
		if (session.role !== "admin" && !assignedElders.includes(session.userId)) {
			throw new RbacError("Solo los ancianos asignados pueden actualizar el seguimiento de este pastoreo.");
		}

		// Postergar: este queda como postergado y se crea otro para la nueva fecha, con el mismo publicador y los mismos 2 ancianos;
		// el comentario original se precarga (quien posterga puede mantenerlo o cambiarlo). Sin fecha (clientes viejos) solo se marca.
		const { status, newDate } = parsed.data;
		const statement = db.update(shepherdingVisitRequests).set({ status }).where(eq(shepherdingVisitRequests.id, id));
		if (status === "postponed" && newDate) {
			const notes = parsed.data.notes !== undefined ? parsed.data.notes?.trim() || null : existing.notes;
			await db.batch([
				statement,
				db.insert(shepherdingVisitRequests).values({
					publisherId: existing.publisherId,
					requestedDate: newDate,
					notes,
					assignedElders: existing.assignedElders,
					status: "pending",
				}),
			]);
		} else {
			await statement;
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
