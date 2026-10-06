import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { operationalSchedules, privileges, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { checkOperationalCollisions } from "@/lib/collision";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { createOperationalSlotSchema } from "@/lib/validation/operational";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);

		const { searchParams } = new URL(request.url);
		const meetingTypeParam = searchParams.get("meetingType");
		const meetingId = searchParams.get("meetingId");
		if ((meetingTypeParam !== "midweek" && meetingTypeParam !== "weekend") || !meetingId) {
			return NextResponse.json({ error: "missing_meeting" }, { status: 400 });
		}
		const meetingType: "midweek" | "weekend" = meetingTypeParam;

		const db = getDb();

		// Primera vez que se abre esta reunión: se siembra un puesto por cada
		// privilegio operativo asignable (todo category='operational' menos
		// "Tareas operativas", que es el privilegio de acceso al módulo, no una
		// tarea) — así cada reunión arranca con los 9 puestos listos para
		// asignar, en vez de una matriz vacía que hay que armar a mano.
		const existingCount = await db
			.select({ id: operationalSchedules.id })
			.from(operationalSchedules)
			.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)))
			.limit(1);
		if (existingCount.length === 0) {
			const assignableTasks = await db
				.select({ id: privileges.id })
				.from(privileges)
				.where(and(eq(privileges.category, "operational"), ne(privileges.id, PRIVILEGE_IDS.OPERATIONAL_ACCESS)));
			if (assignableTasks.length > 0) {
				await db.insert(operationalSchedules).values(
					assignableTasks.map((p) => ({ meetingType, meetingId, privilegeId: p.id })),
				);
			}
		}

		const rows = await db
			.select({
				id: operationalSchedules.id,
				privilegeId: operationalSchedules.privilegeId,
				privilegeName: privileges.name,
				position: operationalSchedules.position,
				assignedUserId: operationalSchedules.assignedUserId,
				assignedUserName: users.fullName,
			})
			.from(operationalSchedules)
			.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
			.leftJoin(users, eq(users.id, operationalSchedules.assignedUserId))
			.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)))
			.orderBy(asc(privileges.name));

		const items = await Promise.all(
			rows.map(async (row) => ({
				...row,
				warnings: row.assignedUserId
					? await checkOperationalCollisions(db, meetingType, meetingId, row.assignedUserId, row.id)
					: [],
			})),
		);

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);

		const parsed = createOperationalSlotSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db
			.insert(operationalSchedules)
			.values(parsed.data)
			.returning({ id: operationalSchedules.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
