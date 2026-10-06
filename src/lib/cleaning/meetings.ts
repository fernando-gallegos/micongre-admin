import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { midweekMeetings, weekendMeetings } from "@/db/schema";
import type { CleaningMeetingType } from "./labels";

/** D1 admite como máximo 100 parámetros por consulta: los `inArray` sobre
 * listas que pueden crecer se parten en tandas. */
export function chunked<T>(items: T[], size = 90): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

export interface CleaningMeeting {
	date: string;
	cancelled: boolean;
}

// midweek_meetings.status: cancelled_assembly / cancelled_memorial son
// cancelaciones; adjusted_co_visit sigue siendo una reunión que se celebra.
// weekend_meetings.status: scheduled | cancelled.
export function isMeetingCancelled(status: string): boolean {
	return status === "cancelled" || status.startsWith("cancelled_");
}

/** Reunión referida por una fila polimórfica (meetingType + meetingId) — null
 * si ya no existe (no hay FK real, ver cleaning_assignments). */
export async function getCleaningMeeting(
	db: Database,
	meetingType: CleaningMeetingType,
	meetingId: string,
): Promise<CleaningMeeting | null> {
	const [row] =
		meetingType === "midweek"
			? await db
					.select({ date: midweekMeetings.meetingDate, status: midweekMeetings.status })
					.from(midweekMeetings)
					.where(eq(midweekMeetings.id, meetingId))
					.limit(1)
			: await db
					.select({ date: weekendMeetings.meetingDate, status: weekendMeetings.status })
					.from(weekendMeetings)
					.where(eq(weekendMeetings.id, meetingId))
					.limit(1);
	return row ? { date: row.date, cancelled: isMeetingCancelled(row.status) } : null;
}

/** Varias reuniones a la vez, indexadas por `${meetingType}:${meetingId}`. Las
 * que ya no existen simplemente no aparecen en el mapa. */
export async function getCleaningMeetings(
	db: Database,
	refs: { meetingType: CleaningMeetingType; meetingId: string }[],
): Promise<Map<string, CleaningMeeting>> {
	const midweekIds = refs.filter((r) => r.meetingType === "midweek").map((r) => r.meetingId);
	const weekendIds = refs.filter((r) => r.meetingType === "weekend").map((r) => r.meetingId);

	const [midweekRows, weekendRows] = await Promise.all([
		Promise.all(
			chunked(midweekIds).map((ids) =>
				db
					.select({ id: midweekMeetings.id, date: midweekMeetings.meetingDate, status: midweekMeetings.status })
					.from(midweekMeetings)
					.where(inArray(midweekMeetings.id, ids)),
			),
		).then((parts) => parts.flat()),
		Promise.all(
			chunked(weekendIds).map((ids) =>
				db
					.select({ id: weekendMeetings.id, date: weekendMeetings.meetingDate, status: weekendMeetings.status })
					.from(weekendMeetings)
					.where(inArray(weekendMeetings.id, ids)),
			),
		).then((parts) => parts.flat()),
	]);

	const out = new Map<string, CleaningMeeting>();
	for (const r of midweekRows) out.set(`midweek:${r.id}`, { date: r.date, cancelled: isMeetingCancelled(r.status) });
	for (const r of weekendRows) out.set(`weekend:${r.id}`, { date: r.date, cancelled: isMeetingCancelled(r.status) });
	return out;
}
