import { and, eq, gte, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import { cleaningTasks, midweekMeetings, weekendMeetings } from "@/db/schema";
import { mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";
import { OWN_CONGREGATION_LABEL, weekOfMonthIndex } from "./labels";
import { isMeetingCancelled } from "./meetings";
import { type AssigneeView, loadAssignees } from "./tasks";

export interface ScheduleCell {
	/** Quiénes lo realizan: nombres de grupos, "Nuestra congregación" u otras congregaciones. */
	names: string[];
	completed: boolean;
}

export interface ThoroughEntry extends ScheduleCell {
	date: string;
}

export interface ScheduleModel {
	year: number;
	/** ligera[mes 0-11][semana 0-4] = columnas de esa semana: entre semana / fin de semana. */
	ligera: { midweek: ScheduleCell | null; weekend: ScheduleCell | null }[][];
	/** profunda[mes 0-11][semana 0-4]. */
	profunda: (ScheduleCell | null)[][];
	/** aFondo[mes 0-11] = las limpiezas a fondo de ese mes. */
	aFondo: ThoroughEntry[][];
}

function names(assignees: AssigneeView[]): string[] {
	return assignees.map((a) =>
		a.type === "group"
			? (a.groupName ?? "Grupo")
			: a.type === "own_congregation"
				? OWN_CONGREGATION_LABEL
				: (a.congregationName ?? "Otra congregación"),
	);
}

/** Mes (0-11) y semana (0-4) del Cronograma de una semana, según su lunes: cada
 * semana cae en exactamente un mes (el de su lunes) y la semana N de un mes es
 * la N-ésima que empieza en él. Una semana cuyo lunes cae en el año anterior
 * se muestra en la semana 1 de enero. */
function gridPosition(mondayISO: string, year: number): { month: number; week: number } {
	const monday = parseISODate(mondayISO);
	if (monday.getUTCFullYear() < year) return { month: 0, week: 0 };
	return { month: monday.getUTCMonth(), week: weekOfMonthIndex(mondayISO) };
}

/** El Cronograma de limpieza del año: lo asignado y lo ya realizado de los 3
 * tipos, en la forma de la cuadrícula del formulario oficial. */
export async function buildSchedule(db: Database, year: number): Promise<ScheduleModel> {
	const from = `${year}-01-01`;
	const to = `${year}-12-31`;

	const model: ScheduleModel = {
		year,
		ligera: Array.from({ length: 12 }, () => Array.from({ length: 5 }, () => ({ midweek: null, weekend: null }))),
		profunda: Array.from({ length: 12 }, () => Array.from({ length: 5 }, () => null)),
		aFondo: Array.from({ length: 12 }, () => []),
	};

	const [midweekRows, weekendRows, tasks] = await Promise.all([
		db
			.select({ id: midweekMeetings.id, date: midweekMeetings.meetingDate, status: midweekMeetings.status })
			.from(midweekMeetings)
			.where(and(gte(midweekMeetings.meetingDate, from), lte(midweekMeetings.meetingDate, to))),
		db
			.select({ id: weekendMeetings.id, date: weekendMeetings.meetingDate, status: weekendMeetings.status })
			.from(weekendMeetings)
			.where(and(gte(weekendMeetings.meetingDate, from), lte(weekendMeetings.meetingDate, to))),
		db.select().from(cleaningTasks),
	]);
	const assignees = await loadAssignees(
		db,
		tasks.map((t) => t.id),
	);
	const cellOf = (taskId: string, completedAt: Date | null): ScheduleCell => ({
		names: names(assignees.get(taskId) ?? []),
		completed: !!completedAt,
	});

	const ligeraByMeeting = new Map(
		tasks.filter((t) => t.kind === "ligera").map((t) => [`${t.meetingType}:${t.meetingId}`, t]),
	);
	const meetings = [
		...midweekRows.map((m) => ({ ...m, type: "midweek" as const })),
		...weekendRows.map((m) => ({ ...m, type: "weekend" as const })),
	];
	for (const m of meetings) {
		// Una reunión cancelada no se limpia: queda su casilla vacía.
		if (isMeetingCancelled(m.status)) continue;
		const task = ligeraByMeeting.get(`${m.type}:${m.id}`);
		if (!task) continue;
		const { month, week } = gridPosition(toISODate(mondayOf(parseISODate(m.date))), year);
		model.ligera[month][week][m.type] = cellOf(task.id, task.completedAt);
	}

	for (const task of tasks) {
		if (task.kind === "profunda" && task.weekStart && task.weekStart >= from && task.weekStart <= to) {
			const { month, week } = gridPosition(task.weekStart, year);
			model.profunda[month][week] = cellOf(task.id, task.completedAt);
		} else if (task.kind === "a_fondo" && task.taskDate && task.taskDate >= from && task.taskDate <= to) {
			model.aFondo[parseISODate(task.taskDate).getUTCMonth()].push({
				date: task.taskDate,
				...cellOf(task.id, task.completedAt),
			});
		}
	}
	for (const month of model.aFondo) month.sort((a, b) => a.date.localeCompare(b.date));

	return model;
}
