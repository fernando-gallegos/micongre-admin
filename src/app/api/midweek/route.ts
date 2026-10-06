import { and, asc, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { MIDWEEK_FIXED_SECTIONS } from "@/lib/rbac/roles";
import { createMidweekMeetingSchema } from "@/lib/validation/midweek";

// El listado (solo fecha/estado) es de lectura abierta a cualquier
// autenticado — lo necesita, por ejemplo, quien registra asistencia (S-88)
// sin ser admin. El detalle con asignaciones sigue siendo admin-only.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const firstOfThisMonth = `${new Date().toISOString().slice(0, 7)}-01`;
		const from = searchParams.get("from") ?? firstOfThisMonth;
		const to = searchParams.get("to");

		const db = getDb();
		const rows = await db
			.select()
			.from(midweekMeetings)
			.where(to ? and(gte(midweekMeetings.meetingDate, from), lte(midweekMeetings.meetingDate, to)) : gte(midweekMeetings.meetingDate, from))
			.orderBy(asc(midweekMeetings.meetingDate));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);

		const parsed = createMidweekMeetingSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [meeting] = await db.insert(midweekMeetings).values(parsed.data).returning({ id: midweekMeetings.id });

		await db.insert(midweekAssignments).values(
			MIDWEEK_FIXED_SECTIONS.map((section) => ({
				meetingId: meeting.id,
				sectionType: section.sectionType,
				sectionTitle: section.sectionTitle,
				sequenceOrder: section.sequenceOrder,
				privilegeId: section.privilegeId,
			})),
		);

		return NextResponse.json({ id: meeting.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
