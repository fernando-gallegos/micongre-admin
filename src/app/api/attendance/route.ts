import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { meetingAttendance } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { assertCanRecordAttendance } from "@/lib/rbac/guards";
import { getSession } from "@/lib/auth/session";
import { upsertAttendanceSchema } from "@/lib/validation/reports";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const meetingType = searchParams.get("meetingType");
		const meetingId = searchParams.get("meetingId");

		const db = getDb();

		if (meetingType && meetingId) {
			if (meetingType !== "midweek" && meetingType !== "weekend") {
				return NextResponse.json({ error: "invalid_meeting_type" }, { status: 400 });
			}
			const [row] = await db
				.select()
				.from(meetingAttendance)
				.where(and(eq(meetingAttendance.meetingType, meetingType), eq(meetingAttendance.meetingId, meetingId)))
				.limit(1);
			return NextResponse.json({ item: row ?? null });
		}

		// ?from=AAAA-MM-DD → toda la asistencia registrada desde esa fecha (p. ej. el año de servicio completo); sin él, las 50 más recientes.
		const from = searchParams.get("from");
		if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
			const rows = await db
				.select()
				.from(meetingAttendance)
				.where(gte(meetingAttendance.meetingDate, from))
				.orderBy(desc(meetingAttendance.meetingDate))
				.limit(600);
			return NextResponse.json({ items: rows });
		}
		const rows = await db.select().from(meetingAttendance).orderBy(desc(meetingAttendance.meetingDate)).limit(50);
		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanRecordAttendance(session);

		const parsed = upsertAttendanceSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const values = { ...parsed.data, recordedByUserId: session.userId, recordedAt: new Date() };

		await db
			.insert(meetingAttendance)
			.values(values)
			.onConflictDoUpdate({
				target: [meetingAttendance.meetingType, meetingAttendance.meetingId],
				set: values,
			});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
