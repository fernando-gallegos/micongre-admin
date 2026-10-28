import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/dateFormat";
import { notifyUser } from "@/lib/push/dispatch";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { SECTION_LABELS } from "@/lib/rbac/roles";

// Botón "Enviar" de Entre semana: asignar NO notifica — el push sale solo
// cuando se presiona, y avisa a todos los asignados de esa reunión.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { id } = await params;

		const db = getDb();
		const [meeting] = await db
			.select({
				meetingDate: midweekMeetings.meetingDate,
				chairmanUserId: midweekMeetings.chairmanUserId,
				openingPrayerUserId: midweekMeetings.openingPrayerUserId,
			})
			.from(midweekMeetings)
			.where(eq(midweekMeetings.id, id))
			.limit(1);
		if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const rows = await db
			.select()
			.from(midweekAssignments)
			.where(eq(midweekAssignments.meetingId, id))
			.orderBy(asc(midweekAssignments.sequenceOrder));

		// Un solo aviso por persona con todas sus partes (presidente, oración inicial y las del programa), y «enviado (N)» cuenta personas.
		const date = formatShortDate(meeting.meetingDate);
		const partsByUser = new Map<string, string[]>();
		const add = (userId: string | null, label: string) => {
			if (userId) partsByUser.set(userId, [...(partsByUser.get(userId) ?? []), label]);
		};
		add(meeting.chairmanUserId, "Presidente");
		add(meeting.openingPrayerUserId, "Oración inicial");
		for (const row of rows) {
			const base = (SECTION_LABELS as Record<string, string>)[row.sectionType] ?? row.sectionType;
			const label = row.sectionTitle ? `${base} — ${row.sectionTitle}` : base;
			add(row.mainAssigneeId, label);
			add(row.assistantAssigneeId, `${label} (ayudante)`);
		}
		await Promise.all(
			[...partsByUser].map(([userId, parts]) =>
				notifyUser(db, userId, {
					title: "Tienes una asignación en la reunión de entre semana",
					body: `${parts.join(" · ")} · ${date}`,
					url: "/panel",
				}),
			),
		);

		return NextResponse.json({ ok: true, sent: partsByUser.size });
	} catch (error) {
		return errorResponse(error);
	}
}
