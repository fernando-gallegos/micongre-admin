import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakers, weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/dateFormat";
import { notifyUser } from "@/lib/push/dispatch";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";

// Botón "Enviar" de Fin de semana: asignar NO notifica — el push sale solo
// cuando se presiona, y avisa a todos los asignados de esa reunión.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const db = getDb();
		const [meeting] = await db.select().from(weekendMeetings).where(eq(weekendMeetings.id, id)).limit(1);
		if (!meeting) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const date = formatShortDate(meeting.meetingDate);
		const targets: Array<[string, string]> = [];
		if (meeting.chairmanUserId) targets.push([meeting.chairmanUserId, "Presidente"]);
		if (meeting.watchtowerConductorId) targets.push([meeting.watchtowerConductorId, "Conductor de La Atalaya"]);
		if (meeting.watchtowerReaderId) targets.push([meeting.watchtowerReaderId, "Lector de La Atalaya"]);
		if (meeting.prayerUserId) targets.push([meeting.prayerUserId, "Oración"]);
		if (meeting.speakerId) {
			const [speaker] = await db.select().from(speakers).where(eq(speakers.id, meeting.speakerId)).limit(1);
			// Un orador visitante no tiene cuenta a quien avisar.
			if (speaker?.kind === "local" && speaker.userId) targets.push([speaker.userId, "Discurso público"]);
		}

		await Promise.all(
			targets.map(([userId, role]) =>
				notifyUser(db, userId, {
					title: "Tienes una asignación en la reunión de fin de semana",
					body: `${role} · ${date}`,
					url: "/panel",
				}),
			),
		);

		return NextResponse.json({ ok: true, sent: targets.length });
	} catch (error) {
		return errorResponse(error);
	}
}
