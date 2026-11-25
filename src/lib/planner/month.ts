// Vista mensual de los planificadores (entre semana, fin de semana y acomodadores): carga en una sola llamada todas las reuniones del mes
// (cada semana en el mes de su lunes), sus casillas y quién puede ir en cada una. Guardar lo hace la pantalla con los endpoints de siempre,
// que revalidan la elegibilidad. Consultas D1: ~5 (elegibilidad) + 4-6 (reuniones y casillas).
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	midweekAssignments,
	midweekMeetings,
	operationalSchedules,
	privileges,
	speakers,
	weekendMeetings,
} from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { effectiveMeetingDate } from "@/lib/attendance/summary";
import { readMeetingSchedules } from "@/lib/assignments/stats";
import { parseRange } from "@/lib/export/builders/meetingDates";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { loadTemplate, slotDisplayName, sortByTemplate, syncMeetingsToTemplate } from "@/lib/operational/template";
import { eligibleFromContext, loadEligibilityContext } from "@/lib/rbac/eligibility";
import { NON_MEETING_OPERATIONAL_IDS, PRIVILEGE_IDS, SECTION_LABELS } from "@/lib/rbac/roles";
import { getStudentPartRule } from "@/lib/rbac/studentParts";
import { mergeRowOrder, numbered, type PlannerRow } from "./rows";

export type PlannerModule = "midweek" | "weekend" | "operational";

export interface PlannerColumn {
	meetingType: "midweek" | "weekend";
	meetingId: string;
	/** Fecha real de la reunión (según el día configurado y los eventos). */
	date: string;
	cancelled: boolean;
}

export interface PlannerCell {
	/**
	 * A dónde se guarda: `m:<campo>` (reunión de entre semana), `a:<id>:<campo>` (parte de entre semana), `w:<campo>` (reunión de fin de
	 * semana) u `o:<id>` (acomodadores). Vacío si la casilla es solo de lectura.
	 */
	target: string;
	privilegeId: string | null;
	value: string | null;
	/** Título real de la parte esa semana (las partes cambian cada semana). */
	title?: string | null;
	maleOnly?: boolean;
	/** Texto a mostrar en lugar de un selector (p. ej. el discursante). */
	readOnly?: string | null;
}

export interface PlannerMonth {
	label: string;
	from: string;
	to: string;
	columns: PlannerColumn[];
	rows: PlannerRow[];
	/** fila → reunión → casilla */
	cells: Record<string, Record<string, PlannerCell>>;
	eligible: Record<string, { id: string; name: string; gender: "male" | "female" }[]>;
	names: Record<string, string>;
}

type Collected = { column: PlannerColumn; rows: (PlannerRow & { cell: PlannerCell })[] };

async function meetingsInRange(db: Database, type: "midweek" | "weekend", from: string, to: string) {
	// La fecha guardada puede ser el lunes o el sábado de la semana: se busca con margen y se filtra por la fecha real.
	const lo = toISODate(addDays(parseISODate(from), -7));
	const hi = toISODate(addDays(parseISODate(to), 7));
	const table = type === "midweek" ? midweekMeetings : weekendMeetings;
	return db
		.select({ id: table.id, date: table.meetingDate, status: table.status })
		.from(table)
		.where(and(gte(table.meetingDate, lo), lte(table.meetingDate, hi)))
		.orderBy(asc(table.meetingDate));
}

function sectionLabel(sectionType: string): string {
	return SECTION_LABELS[sectionType as keyof typeof SECTION_LABELS] ?? sectionType;
}

async function collectMidweek(db: Database, columns: PlannerColumn[], skipOpeningPrayer: boolean): Promise<Collected[]> {
	const ids = columns.map((c) => c.meetingId);
	const meetings = new Map<string, { chairman: string | null; prayer: string | null }>();
	const parts: (typeof midweekAssignments.$inferSelect)[] = [];
	for (const chunk of chunked(ids)) {
		const rows = await db
			.select({ id: midweekMeetings.id, chairman: midweekMeetings.chairmanUserId, prayer: midweekMeetings.openingPrayerUserId })
			.from(midweekMeetings)
			.where(inArray(midweekMeetings.id, chunk));
		for (const r of rows) meetings.set(r.id, { chairman: r.chairman, prayer: r.prayer });
		parts.push(...(await db.select().from(midweekAssignments).where(inArray(midweekAssignments.meetingId, chunk)).orderBy(asc(midweekAssignments.sequenceOrder))));
	}

	return columns.map((column) => {
		const m = meetings.get(column.meetingId);
		const rows: Collected["rows"] = [
			{ key: "chairman", label: "Presidente", group: "Presidencia", cell: { target: "m:chairmanUserId", privilegeId: PRIVILEGE_IDS.MIDWEEK_CHAIRMAN, value: m?.chairman ?? null } },
		];
		if (!skipOpeningPrayer) {
			rows.push({ key: "openingPrayer", label: "Oración inicial", group: "Presidencia", cell: { target: "m:openingPrayerUserId", privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER, value: m?.prayer ?? null } });
		}
		const mine = parts.filter((p) => p.meetingId === column.meetingId);
		for (const { item: p, key, n } of numbered(mine, (p) => `${p.sectionType}|${p.sectionType === "cbs" ? p.sectionTitle : ""}|${p.room ?? ""}`)) {
			const privilegeId =
				p.privilegeId ??
				(p.sectionType === "student_assignment" ? PRIVILEGE_IDS.STUDENT_ASSIGNMENT : p.sectionType === "prayer" ? PRIVILEGE_IDS.CONGREGATION_PRAYER : PRIVILEGE_IDS.CHRISTIAN_LIVING);
			const repeated = mine.filter((o) => o.sectionType === p.sectionType && o.room === p.room).length > 1;
			const base =
				p.sectionType === "prayer"
					? "Oración final"
					: p.sectionType === "cbs"
						? `Estudio bíblico: ${p.sectionTitle ?? ""}`.trim()
						: `${sectionLabel(p.sectionType)}${repeated ? ` ${n + 1}` : ""}`;
			const label = `${base}${p.room === "auxiliary" ? " (sala auxiliar)" : ""}`;
			const title = p.sectionType === "cbs" || p.sectionType === "prayer" ? null : p.sectionTitle;
			const rule = p.sectionType === "student_assignment" ? getStudentPartRule(p.sectionTitle) : null;
			rows.push({ key, label, cell: { target: `a:${p.id}:mainAssigneeId`, privilegeId, value: p.mainAssigneeId, title, maleOnly: rule?.requiresMale } });
			if (rule?.hasHelper) {
				rows.push({
					key: `${key}:assistant`,
					label: `${label} — ayudante`,
					cell: { target: `a:${p.id}:assistantAssigneeId`, privilegeId: PRIVILEGE_IDS.STUDENT_ASSIGNMENT, value: p.assistantAssigneeId },
				});
			}
		}
		return { column, rows };
	});
}

async function collectWeekend(db: Database, columns: PlannerColumn[], names: Map<string, string>): Promise<Collected[]> {
	const ids = columns.map((c) => c.meetingId);
	const rows: {
		id: string;
		chairman: string | null;
		conductor: string | null;
		reader: string | null;
		prayer: string | null;
		speakerName: string | null;
		speakerUser: string | null;
	}[] = [];
	for (const chunk of chunked(ids)) {
		rows.push(
			...(await db
				.select({
					id: weekendMeetings.id,
					chairman: weekendMeetings.chairmanUserId,
					conductor: weekendMeetings.watchtowerConductorId,
					reader: weekendMeetings.watchtowerReaderId,
					prayer: weekendMeetings.prayerUserId,
					speakerName: speakers.fullName,
					speakerUser: speakers.userId,
				})
				.from(weekendMeetings)
				.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
				.where(inArray(weekendMeetings.id, chunk))),
		);
	}
	return columns.map((column) => {
		const m = rows.find((r) => r.id === column.meetingId);
		const speaker = (m?.speakerUser && names.get(m.speakerUser)) || m?.speakerName || null;
		return {
			column,
			rows: [
				{ key: "chairman", label: "Presidente", cell: { target: "w:chairmanUserId", privilegeId: PRIVILEGE_IDS.WEEKEND_CHAIRMAN, value: m?.chairman ?? null } },
				// El discursante se arregla en su pantalla (oradores visitantes, bosquejo y canción): aquí solo se muestra.
				{ key: "speaker", label: "Discurso público", cell: { target: "", privilegeId: null, value: null, readOnly: speaker ?? "—" } },
				{ key: "watchtowerConductor", label: "Conductor de La Atalaya", cell: { target: "w:watchtowerConductorId", privilegeId: PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR, value: m?.conductor ?? null } },
				{ key: "watchtowerReader", label: "Lector de La Atalaya", cell: { target: "w:watchtowerReaderId", privilegeId: PRIVILEGE_IDS.WATCHTOWER_READER, value: m?.reader ?? null } },
				{ key: "prayer", label: "Oración final", cell: { target: "w:prayerUserId", privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER, value: m?.prayer ?? null } },
			],
		};
	});
}

async function collectOperational(db: Database, columns: PlannerColumn[]): Promise<Collected[]> {
	// Reuniones que todavía no tienen sus asignaciones: se arman con la plantilla, igual que al abrirlas en la vista semanal.
	const load = async (type: "midweek" | "weekend", ids: string[]) => {
		const out: { id: string; meetingId: string; privilegeId: string; position: string | null; user: string | null; name: string }[] = [];
		for (const chunk of chunked(ids)) {
			out.push(
				...(await db
					.select({
						id: operationalSchedules.id,
						meetingId: operationalSchedules.meetingId,
						privilegeId: operationalSchedules.privilegeId,
						position: operationalSchedules.position,
						user: operationalSchedules.assignedUserId,
						name: privileges.name,
					})
					.from(operationalSchedules)
					.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
					.where(and(eq(operationalSchedules.meetingType, type), inArray(operationalSchedules.meetingId, chunk)))),
			);
		}
		return out.filter((r) => !NON_MEETING_OPERATIONAL_IDS.includes(r.privilegeId));
	};

	const result: Collected[] = [];
	for (const type of ["midweek", "weekend"] as const) {
		const cols = columns.filter((c) => c.meetingType === type);
		if (cols.length === 0) continue;
		const ids = cols.map((c) => c.meetingId);
		let rows = await load(type, ids);
		const empty = ids.filter((id) => !rows.some((r) => r.meetingId === id));
		if (empty.length) {
			await syncMeetingsToTemplate(db, type, empty);
			rows = await load(type, ids);
		}
		const template = await loadTemplate(db, type);
		const audioVideo: string[] = [PRIVILEGE_IDS.AUDIO_CONSOLE, PRIVILEGE_IDS.VIDEO_ZOOM];
		for (const column of cols) {
			const ordered = sortByTemplate(
				rows.filter((r) => r.meetingId === column.meetingId),
				template,
				(r) => slotDisplayName(r.name, r.position),
			);
			result.push({
				column,
				rows: numbered(ordered, (r) => `${r.privilegeId}|${r.position ?? ""}`).map(({ item: r, key }) => ({
					key,
					label: slotDisplayName(r.name, r.position),
					group: audioVideo.includes(r.privilegeId) ? "Audio y video" : "Acomodadores",
					cell: { target: `o:${r.id}`, privilegeId: r.privilegeId, value: r.user },
				})),
			});
		}
	}
	// Columnas en orden de fecha (entre semana y fin de semana intercaladas).
	return columns.map((c) => result.find((r) => r.column.meetingId === c.meetingId)).filter((r): r is Collected => !!r);
}

export async function loadPlannerMonth(db: Database, module: PlannerModule, date: string): Promise<PlannerMonth> {
	const range = parseRange(new URLSearchParams({ date, scope: "month" }));
	const types: ("midweek" | "weekend")[] = module === "operational" ? ["midweek", "weekend"] : [module];
	const [schedules, ctx, cong, ...lists] = await Promise.all([
		readMeetingSchedules(db),
		loadEligibilityContext(db),
		db.select({ skip: congregations.skipOpeningPrayer }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1),
		...types.map((t) => meetingsInRange(db, t, range.from, range.to)),
	]);

	const columns: PlannerColumn[] = [];
	types.forEach((type, i) => {
		for (const m of lists[i]) {
			const real = effectiveMeetingDate(m.date, type, schedules);
			if (real < range.from || real > range.to) continue;
			const cancelled = type === "midweek" ? m.status !== "scheduled" && m.status !== "adjusted_co_visit" : m.status === "cancelled";
			columns.push({ meetingType: type, meetingId: m.id, date: real, cancelled });
		}
	});
	columns.sort((a, b) => a.date.localeCompare(b.date) || a.meetingType.localeCompare(b.meetingType));

	const userNames = new Map([...ctx.users.values()].map((u) => [u.id, u.fullName]));
	const collected =
		module === "midweek"
			? await collectMidweek(db, columns, !!cong[0]?.skip)
			: module === "weekend"
				? await collectWeekend(db, columns, userNames)
				: await collectOperational(db, columns);

	const rows = mergeRowOrder(collected.map((c) => c.rows.map(({ key, label, group }) => ({ key, label, group }))));
	// Dos filas con el mismo nombre (p. ej. dos «Acomodador de entrada» sin nombre propio) se numeran para distinguirlas.
	const total = new Map<string, number>();
	for (const r of rows) total.set(r.label, (total.get(r.label) ?? 0) + 1);
	const seenLabel = new Map<string, number>();
	for (const r of rows) {
		if ((total.get(r.label) ?? 0) < 2) continue;
		const n = (seenLabel.get(r.label) ?? 0) + 1;
		seenLabel.set(r.label, n);
		r.label = `${r.label} ${n}`;
	}
	const cells: PlannerMonth["cells"] = {};
	const privilegeIds = new Set<string>();
	const valueIds = new Set<string>();
	for (const c of collected) {
		for (const r of c.rows) {
			(cells[r.key] ??= {})[c.column.meetingId] = r.cell;
			if (r.cell.privilegeId) privilegeIds.add(r.cell.privilegeId);
			if (r.cell.value) valueIds.add(r.cell.value);
		}
	}

	const eligible: PlannerMonth["eligible"] = {};
	for (const id of privilegeIds) {
		eligible[id] = eligibleFromContext(ctx, id)
			.map((u) => ({ id: u.id, name: u.fullName, gender: u.gender }))
			.sort((a, b) => a.name.localeCompare(b.name, "es"));
	}
	const names: Record<string, string> = {};
	for (const id of valueIds) names[id] = userNames.get(id) ?? "Otra persona";

	return { label: range.label, from: range.from, to: range.to, columns, rows, cells, eligible, names };
}
