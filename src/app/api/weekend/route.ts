import { and, asc, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { getDefaultWatchtowerConductorId } from "@/lib/weekend/defaults";
import { createWeekendMeetingSchema } from "@/lib/validation/weekend";

// Ver la nota en api/midweek/route.ts: el listado es de lectura abierta a
// cualquier autenticado (lo necesita p. ej. quien registra asistencia S-88).
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
			.from(weekendMeetings)
			.where(to ? and(gte(weekendMeetings.meetingDate, from), lte(weekendMeetings.meetingDate, to)) : gte(weekendMeetings.meetingDate, from))
			.orderBy(asc(weekendMeetings.meetingDate));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = createWeekendMeetingSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const watchtowerConductorId = await getDefaultWatchtowerConductorId(db);
		const [meeting] = await db
			.insert(weekendMeetings)
			.values({ ...parsed.data, watchtowerConductorId })
			.returning({ id: weekendMeetings.id });

		return NextResponse.json({ id: meeting.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
