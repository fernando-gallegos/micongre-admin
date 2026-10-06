import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { listMeetingAssignments } from "@/lib/collision";

// Asignaciones ya guardadas de la reunión (programa + tareas operativas),
// para los avisos pasivos de doble asignación en los programadores. Solo
// lectura y sin sembrar puestos, a diferencia de GET /api/operational.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const meetingType = searchParams.get("meetingType");
		const meetingId = searchParams.get("meetingId");
		if ((meetingType !== "midweek" && meetingType !== "weekend") || !meetingId) {
			return NextResponse.json({ error: "missing_meeting" }, { status: 400 });
		}

		const items = await listMeetingAssignments(getDb(), meetingType, meetingId);
		// `items`: tareas operativas; `program`: asignaciones del programa de la reunión.
		return NextResponse.json({
			items: items.filter((i) => i.operationalId),
			program: items.filter((i) => !i.operationalId).map(({ userId, label }) => ({ userId, label })),
		});
	} catch (error) {
		return errorResponse(error);
	}
}
