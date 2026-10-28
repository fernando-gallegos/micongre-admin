import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BuilderContext } from "../registry";
import type { ReportDoc } from "../types";
import { CONGREGATION_ROW_ID, congregations, midweekMeetings, weekendMeetings } from "@/db/schema";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";
import { effectiveMeetingDate, type MeetingSchedules } from "@/lib/attendance/summary";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { slotDisplayName } from "@/lib/operational/template";
import { loadOperational } from "./meetingData";
import { parseRange } from "./meetingDates";

const FOOTER = "Mi Congre";
const EMPTY = "---";
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «mar 6 oct» */
function shortDate(iso: string): string {
	const d = parseISODate(iso);
	return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Tareas operativas de ambas reuniones en una tabla cruzada (horizontal): una columna por reunión, con la fecha en que de
 * verdad se celebra, y una fila por tarea; las tareas sin nadie asignado en todo el periodo no aparecen y los huecos llevan «---». */
export async function buildOperational(ctx: BuilderContext): Promise<ReportDoc> {
	const { db, session, params } = ctx;
	assertCanAccessOperationalModule(session);

	const range = parseRange(params);

	const [cong] = await db
		.select({ s: congregations.meetingSchedules })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	let schedules: MeetingSchedules | null = null;
	try {
		schedules = cong?.s ? (JSON.parse(cong.s) as MeetingSchedules) : null;
	} catch {
		schedules = null;
	}

	// La fecha guardada puede ser el lunes o el sábado de la semana; se busca con margen y se filtra por la fecha real.
	const from = toISODate(addDays(parseISODate(range.from), -7));
	const to = toISODate(addDays(parseISODate(range.to), 7));
	const [mid, wk] = await Promise.all([
		db
			.select()
			.from(midweekMeetings)
			.where(and(gte(midweekMeetings.meetingDate, from), lte(midweekMeetings.meetingDate, to)))
			.orderBy(asc(midweekMeetings.meetingDate)),
		db
			.select()
			.from(weekendMeetings)
			.where(and(gte(weekendMeetings.meetingDate, from), lte(weekendMeetings.meetingDate, to)))
			.orderBy(asc(weekendMeetings.meetingDate)),
	]);

	const meetings: { type: "midweek" | "weekend"; id: string; date: string }[] = [];
	for (const r of mid) if (r.status === "scheduled") meetings.push({ type: "midweek", id: r.id, date: effectiveMeetingDate(r.meetingDate, "midweek", schedules) });
	for (const r of wk) if (r.status !== "cancelled") meetings.push({ type: "weekend", id: r.id, date: effectiveMeetingDate(r.meetingDate, "weekend", schedules) });
	const inRange = meetings
		.filter((m) => m.date >= range.from && m.date <= range.to)
		.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

	if (inRange.length === 0) {
		return {
			title: `Tareas operativas — ${range.label}`,
			fileName: `tareas-operativas-${range.slug}`,
			landscape: true,
			blocks: [{ type: "paragraph", text: "No hay reuniones programadas en este periodo.", muted: true }],
			footer: FOOTER,
		};
	}

	// Una fila por asignación de la plantilla (una tarea repetida sale en varias filas: la n-ésima de cada reunión va en la n-ésima
	// fila), en el orden de la plantilla; si la asignación tiene nombre, ese nombre en lugar del de la tarea.
	const rowKeys: string[] = [];
	const labels = new Map<string, string>();
	const cells = new Map<string, (string | null)[]>();
	for (const [col, m] of inRange.entries()) {
		const seen = new Map<string, number>();
		for (const r of await loadOperational(db, m.type, m.id)) {
			const base = `${r.privilegeId}|${r.position ?? ""}`;
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			const key = `${base}|${n}`;
			if (!cells.has(key)) {
				cells.set(key, inRange.map(() => null));
				labels.set(key, slotDisplayName(r.task, r.position));
				rowKeys.push(key);
			}
			if (r.person) cells.get(key)![col] = r.person;
		}
	}

	const rows = rowKeys
		.filter((key) => cells.get(key)!.some((p) => p))
		.map((key) => [labels.get(key)!, ...cells.get(key)!.map((p) => p ?? EMPTY)]);

	const columns = [
		{ label: "Asignación", width: 2.4 },
		...inRange.map((m) => ({
			label: `${m.type === "midweek" ? "Entre semana" : "Fin de semana"} · ${shortDate(m.date)}`,
			width: 1.4,
			align: "center" as const,
		})),
	];

	return {
		title: `Tareas operativas — ${range.label}`,
		fileName: `tareas-operativas-${range.slug}`,
		landscape: true,
		blocks: rows.length
			? [{ type: "table", table: { sheetName: "Tareas operativas", columns, rows } }]
			: [{ type: "paragraph", text: "No hay tareas asignadas en este periodo.", muted: true }],
		footer: FOOTER,
	};
}
