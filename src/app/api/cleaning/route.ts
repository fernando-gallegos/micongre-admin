import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningCongregations, cleaningTasks, fieldServiceGroups, midweekMeetings, weekendMeetings } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse } from "@/lib/cleaning/http";
import type { CleaningKind } from "@/lib/cleaning/labels";
import { isMeetingCancelled } from "@/lib/cleaning/meetings";
import { type AssigneeView, loadAssignees } from "@/lib/cleaning/tasks";
import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";

const PAGE_SIZE = 30;
const WEEKS = 12;

interface Row {
	key: string;
	kind: CleaningKind;
	meetingType: "midweek" | "weekend" | null;
	meetingId: string | null;
	weekStart: string | null;
	taskId: string | null;
	date: string;
	dateEnd: string | null;
	cancelled: boolean;
	completedAt: Date | null;
	notes: string | null;
	assignees: AssigneeView[];
}

// Filas de una pestaña del módulo (kind) con sus responsables:
//  - ligera: una fila por reunión (entre semana + fin de semana)
//  - profunda: una fila por semana (las próximas/anteriores 12)
//  - a_fondo: una fila por limpieza a fondo programada
// `period=upcoming` (default) desde hoy; `period=past` lo ya ocurrido.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const params = new URL(request.url).searchParams;
		const kindParam = params.get("kind");
		const kind: CleaningKind = kindParam === "profunda" || kindParam === "a_fondo" ? kindParam : "ligera";
		const past = params.get("period") === "past";
		const today = new Date().toISOString().slice(0, 10);

		const db = getDb();
		const rows: Row[] = [];

		if (kind === "ligera") {
			const [midweekRows, weekendRows] = await Promise.all([
				db
					.select({ id: midweekMeetings.id, date: midweekMeetings.meetingDate, status: midweekMeetings.status })
					.from(midweekMeetings)
					.where(past ? lt(midweekMeetings.meetingDate, today) : gte(midweekMeetings.meetingDate, today))
					.orderBy(past ? desc(midweekMeetings.meetingDate) : asc(midweekMeetings.meetingDate))
					.limit(PAGE_SIZE),
				db
					.select({ id: weekendMeetings.id, date: weekendMeetings.meetingDate, status: weekendMeetings.status })
					.from(weekendMeetings)
					.where(past ? lt(weekendMeetings.meetingDate, today) : gte(weekendMeetings.meetingDate, today))
					.orderBy(past ? desc(weekendMeetings.meetingDate) : asc(weekendMeetings.meetingDate))
					.limit(PAGE_SIZE),
			]);
			const meetings = [
				...midweekRows.map((m) => ({ meetingType: "midweek" as const, meetingId: m.id, date: m.date, status: m.status })),
				...weekendRows.map((m) => ({ meetingType: "weekend" as const, meetingId: m.id, date: m.date, status: m.status })),
			]
				.sort((a, b) => (past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
				.slice(0, PAGE_SIZE);

			const midweekIds = meetings.filter((m) => m.meetingType === "midweek").map((m) => m.meetingId);
			const weekendIds = meetings.filter((m) => m.meetingType === "weekend").map((m) => m.meetingId);
			const tasks = [
				...(midweekIds.length
					? await db
							.select()
							.from(cleaningTasks)
							.where(and(eq(cleaningTasks.kind, "ligera"), eq(cleaningTasks.meetingType, "midweek"), inArray(cleaningTasks.meetingId, midweekIds)))
					: []),
				...(weekendIds.length
					? await db
							.select()
							.from(cleaningTasks)
							.where(and(eq(cleaningTasks.kind, "ligera"), eq(cleaningTasks.meetingType, "weekend"), inArray(cleaningTasks.meetingId, weekendIds)))
					: []),
			];
			const taskByMeeting = new Map(tasks.map((t) => [`${t.meetingType}:${t.meetingId}`, t]));
			const assignees = await loadAssignees(db, tasks.map((t) => t.id));

			for (const m of meetings) {
				const task = taskByMeeting.get(`${m.meetingType}:${m.meetingId}`);
				rows.push({
					key: `ligera:${m.meetingType}:${m.meetingId}`,
					kind,
					meetingType: m.meetingType,
					meetingId: m.meetingId,
					weekStart: null,
					taskId: task?.id ?? null,
					date: m.date,
					dateEnd: null,
					cancelled: isMeetingCancelled(m.status),
					completedAt: task?.completedAt ?? null,
					notes: null,
					assignees: task ? (assignees.get(task.id) ?? []) : [],
				});
			}
		} else if (kind === "profunda") {
			const thisMonday = mondayOf(new Date());
			const weekStarts = Array.from({ length: WEEKS }, (_, i) =>
				toISODate(addDays(thisMonday, past ? -7 * (i + 1) : 7 * i)),
			);
			const tasks = await db
				.select()
				.from(cleaningTasks)
				.where(and(eq(cleaningTasks.kind, "profunda"), inArray(cleaningTasks.weekStart, weekStarts)));
			const taskByWeek = new Map(tasks.map((t) => [t.weekStart, t]));
			const assignees = await loadAssignees(db, tasks.map((t) => t.id));

			for (const weekStart of weekStarts) {
				const task = taskByWeek.get(weekStart);
				rows.push({
					key: `profunda:${weekStart}`,
					kind,
					meetingType: null,
					meetingId: null,
					weekStart,
					taskId: task?.id ?? null,
					date: weekStart,
					dateEnd: toISODate(addDays(parseISODate(weekStart), 6)),
					cancelled: false,
					completedAt: task?.completedAt ?? null,
					notes: null,
					assignees: task ? (assignees.get(task.id) ?? []) : [],
				});
			}
		} else {
			const tasks = await db
				.select()
				.from(cleaningTasks)
				.where(
					and(
						eq(cleaningTasks.kind, "a_fondo"),
						past ? lt(cleaningTasks.taskDate, today) : gte(cleaningTasks.taskDate, today),
					),
				)
				.orderBy(past ? desc(cleaningTasks.taskDate) : asc(cleaningTasks.taskDate))
				.limit(PAGE_SIZE);
			const assignees = await loadAssignees(db, tasks.map((t) => t.id));
			for (const task of tasks) {
				rows.push({
					key: `a_fondo:${task.id}`,
					kind,
					meetingType: null,
					meetingId: null,
					weekStart: null,
					taskId: task.id,
					date: task.taskDate ?? today,
					dateEnd: null,
					cancelled: false,
					completedAt: task.completedAt,
					notes: task.notes,
					assignees: assignees.get(task.id) ?? [],
				});
			}
		}

		const [groups, congregations] = await Promise.all([
			db
				.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name, color: fieldServiceGroups.color })
				.from(fieldServiceGroups)
				.where(eq(fieldServiceGroups.active, true))
				.orderBy(asc(fieldServiceGroups.name)),
			db
				.select({ id: cleaningCongregations.id, name: cleaningCongregations.name })
				.from(cleaningCongregations)
				.where(eq(cleaningCongregations.active, true))
				.orderBy(asc(cleaningCongregations.name)),
		]);

		return NextResponse.json({ items: rows, groups, congregations });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
