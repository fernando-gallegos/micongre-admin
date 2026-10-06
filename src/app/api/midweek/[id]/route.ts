import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, midweekAssignments, midweekMeetings, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { updateMidweekMeetingSchema } from "@/lib/validation/midweek";

async function loadMeetingWithAssignments(db: ReturnType<typeof getDb>, id: string) {
	const [meeting] = await db.select().from(midweekMeetings).where(eq(midweekMeetings.id, id)).limit(1);
	if (!meeting) return null;

	const rows = await db
		.select({
			id: midweekAssignments.id,
			sectionType: midweekAssignments.sectionType,
			sectionTitle: midweekAssignments.sectionTitle,
			description: midweekAssignments.description,
			sequenceOrder: midweekAssignments.sequenceOrder,
			partNumber: midweekAssignments.partNumber,
			room: midweekAssignments.room,
			durationMinutes: midweekAssignments.durationMinutes,
			privilegeId: midweekAssignments.privilegeId,
			mainAssigneeId: midweekAssignments.mainAssigneeId,
			assistantAssigneeId: midweekAssignments.assistantAssigneeId,
		})
		.from(midweekAssignments)
		.where(eq(midweekAssignments.meetingId, id))
		.orderBy(asc(midweekAssignments.sequenceOrder));

	const userIds = Array.from(
		new Set(rows.flatMap((r) => [r.mainAssigneeId, r.assistantAssigneeId]).filter((v): v is string => !!v)),
	);
	const relatedUsers = userIds.length
		? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds))
		: [];
	const nameById = new Map(relatedUsers.map((u) => [u.id, u.fullName]));

	const assignments = rows.map((r) => ({
		...r,
		mainAssigneeName: r.mainAssigneeId ? (nameById.get(r.mainAssigneeId) ?? null) : null,
		assistantAssigneeName: r.assistantAssigneeId ? (nameById.get(r.assistantAssigneeId) ?? null) : null,
	}));

	const [cong] = await db
		.select({ skip: congregations.skipOpeningPrayer })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);

	const extraIds = [meeting.chairmanUserId, meeting.openingPrayerUserId].filter((v): v is string => !!v);
	const extra = extraIds.length
		? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, extraIds))
		: [];
	const extraName = new Map(extra.map((u) => [u.id, u.fullName]));

	return {
		meeting: {
			...meeting,
			chairmanName: meeting.chairmanUserId ? (extraName.get(meeting.chairmanUserId) ?? null) : null,
			openingPrayerName: meeting.openingPrayerUserId ? (extraName.get(meeting.openingPrayerUserId) ?? null) : null,
		},
		assignments,
		skipOpeningPrayer: !!cong?.skip,
	};
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Lectura abierta a toda persona con sesión (la app móvil muestra el programa a todos); solo las notas internas
		// quedan reservadas a quien administra el módulo. Escribir sigue exigiendo el privilegio.
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const canSeeNotes = session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.MIDWEEK_ACCESS);
		const { id } = await params;

		const db = getDb();
		const result = await loadMeetingWithAssignments(db, id);
		if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
		if (!canSeeNotes) result.meeting.notes = null;

		return NextResponse.json(result);
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { id } = await params;

		const parsed = updateMidweekMeetingSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		await db.update(midweekMeetings).set(parsed.data).where(eq(midweekMeetings.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { id } = await params;

		const db = getDb();
		await db.delete(midweekMeetings).where(eq(midweekMeetings.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
