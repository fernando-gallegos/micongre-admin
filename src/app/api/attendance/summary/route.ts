import { eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, meetingAttendance } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { summarizeAttendance, type MeetingSchedules } from "@/lib/attendance/summary";
import { getSession } from "@/lib/auth/session";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";

// Promedios mensuales de asistencia por tipo de reunión (presencial + Zoom por reunión, entre el número de reuniones del mes).
// ?from=AAAA-MM-DD acota (por ejemplo, el inicio del año de servicio); cada reunión cuenta en el mes en que se celebra.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const raw = new URL(request.url).searchParams.get("from");
		const from = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
		const db = getDb();
		const [cong] = await db.select({ s: congregations.meetingSchedules }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
		let schedules: MeetingSchedules | null = null;
		try {
			schedules = cong?.s ? (JSON.parse(cong.s) as MeetingSchedules) : null;
		} catch {
			schedules = null;
		}

		// La fecha guardada puede ser unos días anterior a la reunión (el lunes de su semana): se traen de más y luego se recorta.
		const lower = from ? toISODate(addDays(parseISODate(from), -7)) : null;
		const rows = await (lower
			? db.select().from(meetingAttendance).where(gte(meetingAttendance.meetingDate, lower))
			: db.select().from(meetingAttendance));
		const months = summarizeAttendance(
			rows.map((r) => ({ meetingType: r.meetingType, meetingDate: r.meetingDate, inPersonCount: r.inPersonCount, zoomCount: r.zoomCount })),
			schedules,
			from ?? undefined,
		);
		return NextResponse.json({ months }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		return errorResponse(error);
	}
}
