import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisitRequests, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertIsServiceCommittee } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const db = getDb();
		await assertIsServiceCommittee(db, session);
		const [requestRows, elderRows] = await Promise.all([
			db
				.select({
					id: shepherdingVisitRequests.id,
					publisherId: shepherdingVisitRequests.publisherId,
					publisherName: users.fullName,
					requestedDate: shepherdingVisitRequests.requestedDate,
					notes: shepherdingVisitRequests.notes,
					assignedElders: shepherdingVisitRequests.assignedElders,
					status: shepherdingVisitRequests.status,
					createdAt: shepherdingVisitRequests.createdAt,
				})
				.from(shepherdingVisitRequests)
				.innerJoin(users, eq(users.id, shepherdingVisitRequests.publisherId))
				.orderBy(desc(shepherdingVisitRequests.requestedDate)),
			db
				.select({ id: users.id, fullName: users.fullName })
				.from(users)
				.innerJoin(
					theocraticAppointments,
					and(
						eq(theocraticAppointments.userId, users.id),
						eq(theocraticAppointments.appointmentType, "elder"),
						isNull(theocraticAppointments.endDate),
					),
				)
				.where(notHiddenAdmin)
				.orderBy(asc(users.fullName)),
		]);

		// Resuelve por nombre (no solo la lista de ancianos ACTIVOS de arriba —
		// un anciano asignado hace tiempo pudo dejar el nombramiento después).
		const assignedIds = new Set(
			requestRows.flatMap((r) => (r.assignedElders ? (JSON.parse(r.assignedElders) as string[]) : [])),
		);
		const assignedNameRows = assignedIds.size
			? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [...assignedIds]))
			: [];
		const nameById = new Map(assignedNameRows.map((u) => [u.id, u.fullName]));

		return NextResponse.json({
			items: requestRows.map((r) => ({
				...r,
				assignedElders: r.assignedElders
					? (JSON.parse(r.assignedElders) as string[]).map((id) => nameById.get(id) ?? "—")
					: null,
			})),
			elders: elderRows,
		});
	} catch (error) {
		return errorResponse(error);
	}
}
