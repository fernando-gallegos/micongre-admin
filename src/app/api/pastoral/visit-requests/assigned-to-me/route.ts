import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { shepherdingVisitRequests, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

// Solicitudes donde el usuario logueado es uno de los 2 ancianos asignados —
// separado de /mine (que es "lo que YO solicité"), ver comentario en
// src/lib/queries/panel.ts sobre por qué son casos distintos.
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		const rows = await db
			.select({
				id: shepherdingVisitRequests.id,
				publisherName: users.fullName,
				requestedDate: shepherdingVisitRequests.requestedDate,
				notes: shepherdingVisitRequests.notes,
				assignedElders: shepherdingVisitRequests.assignedElders,
				status: shepherdingVisitRequests.status,
			})
			.from(shepherdingVisitRequests)
			.innerJoin(users, eq(users.id, shepherdingVisitRequests.publisherId))
			// Una vez atendido (completado, postergado o cancelado) deja de
			// aparecer en Mi Panel del anciano — solo lo pendiente.
			.where(eq(shepherdingVisitRequests.status, "pending"))
			.orderBy(desc(shepherdingVisitRequests.requestedDate));

		const mine = rows
			.map((r) => ({ ...r, elderIds: r.assignedElders ? (JSON.parse(r.assignedElders) as string[]) : [] }))
			.filter((r) => r.elderIds.includes(session.userId));

		const otherElderIds = new Set(mine.flatMap((r) => r.elderIds.filter((id) => id !== session.userId)));
		const otherElderNames = otherElderIds.size
			? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, [...otherElderIds]))
			: [];
		const nameById = new Map(otherElderNames.map((e) => [e.id, e.fullName]));

		return NextResponse.json({
			items: mine.map((r) => ({
				id: r.id,
				publisherName: r.publisherName,
				requestedDate: r.requestedDate,
				notes: r.notes,
				status: r.status,
				coElderName: nameById.get(r.elderIds.find((id) => id !== session.userId) ?? "") ?? null,
			})),
		});
	} catch (error) {
		return errorResponse(error);
	}
}
