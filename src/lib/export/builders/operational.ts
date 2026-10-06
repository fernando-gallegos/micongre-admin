import { and, asc, gte, lte } from "drizzle-orm";
import type { BuilderContext } from "../registry";
import type { ReportBlock, ReportDoc } from "../types";
import { midweekMeetings, weekendMeetings } from "@/db/schema";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";
import { loadMeetingTimes, loadOperational, UNASSIGNED, whenLabel } from "./meetingData";
import { parseRange } from "./meetingDates";

const FOOTER = "Mi Congre";

export async function buildOperational(ctx: BuilderContext): Promise<ReportDoc> {
	const { db, session, params } = ctx;
	assertCanAccessOperationalModule(session);

	const range = parseRange(params);
	const meetingParam = params.get("meeting");
	const which: "midweek" | "weekend" | "both" =
		meetingParam === "midweek" || meetingParam === "weekend" ? meetingParam : "both";

	const times = await loadMeetingTimes(db);
	const meetings: { type: "midweek" | "weekend"; id: string; date: string; cancelled: boolean }[] = [];

	if (which !== "weekend") {
		const rows = await db
			.select()
			.from(midweekMeetings)
			.where(and(gte(midweekMeetings.meetingDate, range.from), lte(midweekMeetings.meetingDate, range.to)))
			.orderBy(asc(midweekMeetings.meetingDate));
		for (const r of rows) meetings.push({ type: "midweek", id: r.id, date: r.meetingDate, cancelled: r.status !== "scheduled" });
	}
	if (which !== "midweek") {
		const rows = await db
			.select()
			.from(weekendMeetings)
			.where(and(gte(weekendMeetings.meetingDate, range.from), lte(weekendMeetings.meetingDate, range.to)))
			.orderBy(asc(weekendMeetings.meetingDate));
		for (const r of rows) meetings.push({ type: "weekend", id: r.id, date: r.meetingDate, cancelled: r.status === "cancelled" });
	}
	meetings.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

	const blocks: ReportBlock[] = [];
	if (meetings.length === 0) blocks.push({ type: "paragraph", text: "No hay reuniones programadas.", muted: true });

	for (const m of meetings) {
		const name = m.type === "midweek" ? "Entre semana" : "Fin de semana";
		const time = m.type === "midweek" ? times.midweek : times.weekend;
		blocks.push({ type: "heading", text: `${name} — ${whenLabel(m.date, time)}`, level: 2 });
		if (m.cancelled) {
			blocks.push({ type: "paragraph", text: "Reunión cancelada", muted: true });
			continue;
		}
		const rows = await loadOperational(db, m.type, m.id);
		blocks.push({
			type: "table",
			table: {
				sheetName: `${name} ${m.date}`,
				columns: [
					{ label: "Tarea", width: 2 },
					{ label: "Asignado", width: 3 },
				],
				rows: rows.map((r) => [
					r.position ? `${r.task} (${r.position})` : r.task,
					r.person ?? UNASSIGNED,
				]),
			},
		});
	}

	const title =
		which === "both"
			? `Tareas operativas — ${range.label}`
			: `Tareas operativas, ${which === "midweek" ? "entre semana" : "fin de semana"} — ${range.label}`;
	return {
		title,
		fileName: `tareas-operativas-${which}-${range.slug}`,
		blocks,
		footer: FOOTER,
	};
}
