import { and, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { addDays, parseISODate, toISODate, weekStartsOfMonth } from "@/lib/mwb/dates";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { getDefaultWatchtowerConductorId } from "@/lib/weekend/defaults";
import { generateWeekendMonthSchema } from "@/lib/validation/weekend";
import { importWatchtowerForWeeks } from "@/lib/weekend/watchtower";

// Crea las reuniones de fin de semana (sábado) de todas las semanas del mes de
// la semana indicada que todavía no tengan una, y completa en todas el estudio de La
// Atalaya (título y canciones) si están vacíos. Lo que ya tienen no se pisa.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = generateWeekendMonthSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const weekStarts = weekStartsOfMonth(parsed.data.weekStart);
		const lastSunday = toISODate(addDays(parseISODate(weekStarts[weekStarts.length - 1]), 6));

		const db = getDb();
		const existing = await db
			.select({ meetingDate: weekendMeetings.meetingDate })
			.from(weekendMeetings)
			.where(and(gte(weekendMeetings.meetingDate, weekStarts[0]), lte(weekendMeetings.meetingDate, lastSunday)));

		const missing = weekStarts.filter((monday) => {
			const sunday = toISODate(addDays(parseISODate(monday), 6));
			return !existing.some((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
		});

		if (missing.length > 0) {
			const watchtowerConductorId = await getDefaultWatchtowerConductorId(db);
			await db.insert(weekendMeetings).values(
				missing.map((monday) => ({
					meetingDate: toISODate(addDays(parseISODate(monday), 5)),
					watchtowerConductorId,
				})),
			);
		}

		// Título del estudio de La Atalaya y sus dos canciones, directo de JW.ORG.
		const watchtower = await importWatchtowerForWeeks(db, weekStarts);

		return NextResponse.json({ created: missing.length, skipped: weekStarts.length - missing.length, watchtower });
	} catch (error) {
		return errorResponse(error);
	}
}
