import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { operationalSchedules, privileges, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

// Tareas operativas de una reunión (con nombres), solo lectura y sin sembrar puestos, para la app
// Android: quien puede ver el programa de la reunión también ve quién tiene las tareas operativas.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		// Solo lectura y abierto a toda persona con sesión: es parte de lo que se muestra de cada reunión.

		const { searchParams } = new URL(request.url);
		const meetingType = searchParams.get("meetingType");
		const meetingId = searchParams.get("meetingId");
		if ((meetingType !== "midweek" && meetingType !== "weekend") || !meetingId) {
			return NextResponse.json({ error: "missing_meeting" }, { status: 400 });
		}

		const rows = await getDb()
			.select({
				id: operationalSchedules.id,
				privilegeId: operationalSchedules.privilegeId,
				privilegeName: privileges.name,
				position: operationalSchedules.position,
				assignedUserName: users.fullName,
			})
			.from(operationalSchedules)
			.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
			.leftJoin(users, eq(users.id, operationalSchedules.assignedUserId))
			.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)))
			.orderBy(asc(privileges.name), asc(operationalSchedules.position));
		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}
