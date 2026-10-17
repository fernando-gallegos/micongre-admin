import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { meetingAttendance } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { assertCanRecordAttendance } from "@/lib/rbac/guards";
import { getSession } from "@/lib/auth/session";
import { upsertAttendanceSchema } from "@/lib/validation/reports";
import { rememberOperation, replayIfProcessed } from "@/lib/http/idempotency";

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
		const replay = await replayIfProcessed(db, request, session.userId);
		if (replay) return replay;

		// Desde la cola sin internet: si alguien registró otra cifra mientras tanto, no se pisa — la app lo guarda y avisa.
		const { baseVersion, ...attendance } = parsed.data;
		if (baseVersion !== undefined) {
			const [current] = await db
				.select()
				.from(meetingAttendance)
				.where(and(eq(meetingAttendance.meetingType, attendance.meetingType), eq(meetingAttendance.meetingId, attendance.meetingId)))
				.limit(1);
			const currentVersion = current ? Math.floor(current.recordedAt.getTime() / 1000) : null;
			if (currentVersion !== baseVersion) return NextResponse.json({ error: "conflict", current: current ?? null }, { status: 409 });
		}

		const recordedAt = new Date();
		const values = { ...attendance, recordedByUserId: session.userId, recordedAt };

		await db
			.insert(meetingAttendance)
			.values(values)
			.onConflictDoUpdate({
				target: [meetingAttendance.meetingType, meetingAttendance.meetingId],
				set: values,
			});

		await rememberOperation(db, request, session.userId);
		return NextResponse.json({ ok: true, version: Math.floor(recordedAt.getTime() / 1000) });
	} catch (error) {
		return errorResponse(error);
	}
}
