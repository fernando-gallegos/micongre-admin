import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCongregationModule } from "@/lib/rbac/guards";
import { updateCongregationSchema } from "@/lib/validation/congregation";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessCongregationModule(session);

		const db = getDb();
		let [row] = await db.select().from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
		if (!row) {
			[row] = await db.insert(congregations).values({ id: CONGREGATION_ROW_ID, name: "Mi congregación" }).returning();
		}

		// Comité de servicio (sfg 1:10): solo se muestra aquí, ya no se edita —
		// se asigna desde la ficha del publicador → Nombramientos (ver
		// PUT /api/publishers/[id]/appointments, que mantiene estos 3 campos
		// sincronizados con quien tiene el nombramiento vigente).
		const committeeIds = [row.cobeUserId, row.secretaryUserId, row.serviceOverseerUserId].filter(
			(id): id is string => !!id,
		);
		const committeeNames = committeeIds.length
			? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, committeeIds))
			: [];
		const nameById = new Map(committeeNames.map((n) => [n.id, n.fullName]));

		return NextResponse.json({
			...row,
			cobeName: row.cobeUserId ? (nameById.get(row.cobeUserId) ?? null) : null,
			secretaryName: row.secretaryUserId ? (nameById.get(row.secretaryUserId) ?? null) : null,
			serviceOverseerName: row.serviceOverseerUserId ? (nameById.get(row.serviceOverseerUserId) ?? null) : null,
			meetingSchedules: row.meetingSchedules ? JSON.parse(row.meetingSchedules) : null,
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PATCH(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCongregationModule(session);

		const parsed = updateCongregationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { meetingSchedules, ...rest } = parsed.data;
		const db = getDb();
		await db
			.update(congregations)
			.set({
				...rest,
				...(meetingSchedules !== undefined
					? { meetingSchedules: meetingSchedules ? JSON.stringify(meetingSchedules) : null }
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(congregations.id, CONGREGATION_ROW_ID));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
