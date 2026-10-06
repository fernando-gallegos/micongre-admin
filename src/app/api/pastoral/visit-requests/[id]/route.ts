import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisitRequests, theocraticAppointments } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertIsServiceCommittee } from "@/lib/rbac/guards";
import { assignVisitRequestSchema } from "@/lib/validation/pastoralCare";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const db = getDb();
		await assertIsServiceCommittee(db, session);
		const { id } = await params;

		const parsed = assignVisitRequestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		// Revalida que ambos sean ancianos activos — nunca confía en que la
		// opción vino realmente del selector filtrado del comité.
		const activeElders = await db
			.select({ id: theocraticAppointments.userId })
			.from(theocraticAppointments)
			.where(
				and(
					inArray(theocraticAppointments.userId, parsed.data.assignedElders),
					eq(theocraticAppointments.appointmentType, "elder"),
					isNull(theocraticAppointments.endDate),
				),
			);
		if (activeElders.length !== 2) {
			return NextResponse.json({ error: "invalid_elders" }, { status: 400 });
		}

		await db
			.update(shepherdingVisitRequests)
			.set({ assignedElders: JSON.stringify(parsed.data.assignedElders) })
			.where(eq(shepherdingVisitRequests.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const db = getDb();
		if (session.role !== "admin") {
			const [existing] = await db
				.select({ publisherId: shepherdingVisitRequests.publisherId })
				.from(shepherdingVisitRequests)
				.where(eq(shepherdingVisitRequests.id, id))
				.limit(1);
			const isOwner = existing?.publisherId === session.userId;
			if (!isOwner) await assertIsServiceCommittee(db, session);
		}

		await db.delete(shepherdingVisitRequests).where(eq(shepherdingVisitRequests.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
