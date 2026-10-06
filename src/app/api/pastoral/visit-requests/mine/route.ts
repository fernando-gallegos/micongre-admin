import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisitRequests, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { createVisitRequestSchema } from "@/lib/validation/pastoralCare";

export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		// Solo "pending" — una vez que los ancianos asignados la marcan
		// completada/postergada/cancelada, deja de aparecer en Mi Panel para
		// quien la solicitó (ver src/lib/queries/panel.ts para el mismo criterio
		// del lado del comité/ancianos).
		const rows = await db
			.select()
			.from(shepherdingVisitRequests)
			.where(
				and(
					eq(shepherdingVisitRequests.publisherId, session.userId),
					eq(shepherdingVisitRequests.status, "pending"),
				),
			)
			.orderBy(desc(shepherdingVisitRequests.requestedDate));

		const elderIds = new Set(
			rows.flatMap((r) => (r.assignedElders ? (JSON.parse(r.assignedElders) as string[]) : [])),
		);
		const elderNames = elderIds.size
			? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [...elderIds]))
			: [];
		const nameById = new Map(elderNames.map((e) => [e.id, e.fullName]));

		return NextResponse.json({
			items: rows.map((r) => ({
				...r,
				assignedElders: r.assignedElders
					? (JSON.parse(r.assignedElders) as string[]).map((id) => nameById.get(id) ?? "—")
					: null,
			})),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = createVisitRequestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db
			.insert(shepherdingVisitRequests)
			.values({ ...parsed.data, publisherId: session.userId })
			.returning({ id: shepherdingVisitRequests.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
