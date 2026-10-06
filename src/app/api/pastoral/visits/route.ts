import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisits, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessPastoralDashboard, isServiceCommitteeMember } from "@/lib/rbac/guards";
import { createVisitSchema } from "@/lib/validation/pastoralCare";

// Confidencialidad de 3 niveles (ver plan): admin, comité de servicio, o un
// anciano en eldersAssigned ven las notas completas; el resto ve la fila
// (hubo una visita) pero con confidentialNotes redactado, salvo que la
// visita esté marcada visibleToAllElders.
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const db = getDb();
		const [rows, isCommittee] = await Promise.all([
			db
				.select({
					id: shepherdingVisits.id,
					publisherId: shepherdingVisits.publisherId,
					publisherName: users.fullName,
					dateVisited: shepherdingVisits.dateVisited,
					eldersAssigned: shepherdingVisits.eldersAssigned,
					scripturesConsidered: shepherdingVisits.scripturesConsidered,
					followUpNeeded: shepherdingVisits.followUpNeeded,
					confidentialNotes: shepherdingVisits.confidentialNotes,
					visibleToAllElders: shepherdingVisits.visibleToAllElders,
					createdAt: shepherdingVisits.createdAt,
				})
				.from(shepherdingVisits)
				.innerJoin(users, eq(users.id, shepherdingVisits.publisherId))
				.orderBy(desc(shepherdingVisits.dateVisited)),
			session.role === "admin" ? Promise.resolve(true) : isServiceCommitteeMember(db, session.userId),
		]);

		const items = rows.map((row) => {
			const eldersAssigned = JSON.parse(row.eldersAssigned) as string[];
			const canSeeNotes =
				session.role === "admin" || isCommittee || eldersAssigned.includes(session.userId) || row.visibleToAllElders;
			return {
				...row,
				eldersAssigned,
				confidentialNotes: canSeeNotes ? row.confidentialNotes : null,
				redacted: !canSeeNotes,
			};
		});

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const parsed = createVisitSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { eldersAssigned, ...rest } = parsed.data;
		const db = getDb();
		const [created] = await db
			.insert(shepherdingVisits)
			.values({ ...rest, eldersAssigned: JSON.stringify(eldersAssigned), createdByUserId: session.userId })
			.returning({ id: shepherdingVisits.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
