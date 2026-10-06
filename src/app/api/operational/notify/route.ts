import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekMeetings, operationalSchedules, privileges, weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/dateFormat";
import { notifyUser } from "@/lib/push/dispatch";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";
import { notifyOperationalSchema } from "@/lib/validation/operational";

// Botón "Enviar" de la matriz operativa: asignar NO notifica — el push sale
// solo cuando se presiona, y avisa a todos los asignados de esa reunión.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);

		const parsed = notifyOperationalSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const { meetingType, meetingId } = parsed.data;

		const db = getDb();
		const rows = await db
			.select({
				assignedUserId: operationalSchedules.assignedUserId,
				privilegeName: privileges.name,
				position: operationalSchedules.position,
			})
			.from(operationalSchedules)
			.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
			.where(
				and(
					eq(operationalSchedules.meetingType, meetingType),
					eq(operationalSchedules.meetingId, meetingId),
					isNotNull(operationalSchedules.assignedUserId),
				),
			);

		if (rows.length === 0) {
			return NextResponse.json({ ok: true, sent: 0 });
		}

		const [meeting] =
			meetingType === "midweek"
				? await db
						.select({ meetingDate: midweekMeetings.meetingDate })
						.from(midweekMeetings)
						.where(eq(midweekMeetings.id, meetingId))
						.limit(1)
				: await db
						.select({ meetingDate: weekendMeetings.meetingDate })
						.from(weekendMeetings)
						.where(eq(weekendMeetings.id, meetingId))
						.limit(1);

		await Promise.all(
			rows.map((row) => {
				const label = row.position ? `${row.privilegeName} — ${row.position}` : row.privilegeName;
				return notifyUser(db, row.assignedUserId as string, {
					title: "Se te asignó una tarea operativa",
					body: `${label}${meeting ? ` · ${formatShortDate(meeting.meetingDate)}` : ""}`,
					url: "/panel",
				});
			}),
		);

		return NextResponse.json({ ok: true, sent: rows.length });
	} catch (error) {
		return errorResponse(error);
	}
}
