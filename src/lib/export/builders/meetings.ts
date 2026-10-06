import type { BuilderContext } from "../registry";
import type { ReportBlock, ReportDoc } from "../types";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAccessMidweekModule, assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { SECTION_LABELS } from "@/lib/rbac/roles";
import {
	loadMeetingTimes,
	loadMidweek,
	loadWeekend,
	UNASSIGNED,
	whenLabel,
	type MidweekData,
	type WeekendData,
} from "./meetingData";
import { parseRange } from "./meetingDates";

const FOOTER = "Mi Congre";

const MIDWEEK_STATUS: Record<string, string> = {
	cancelled_assembly: "Cancelada (asamblea)",
	cancelled_memorial: "Cancelada (Conmemoración)",
	adjusted_co_visit: "Ajustada (visita del superintendente de circuito)",
};

function partLabel(p: MidweekData["parts"][number]): string {
	const base = p.sectionTitle?.trim() || SECTION_LABELS[p.sectionType] || p.sectionType;
	const numbered = p.partNumber != null ? `${p.partNumber}. ${base}` : base;
	return p.room === "auxiliary" ? `${numbered} (sala auxiliar)` : numbered;
}

function midweekBlocks(m: MidweekData, time: string | null, headingLevel: 1 | 2): ReportBlock[] {
	const blocks: ReportBlock[] = [{ type: "heading", text: whenLabel(m.date, time), level: headingLevel }];
	if (m.status !== "scheduled") {
		blocks.push({ type: "paragraph", text: MIDWEEK_STATUS[m.status] ?? "Reunión no programada normalmente", muted: true });
		return blocks;
	}
	const items = [{ label: "Presidente", value: m.chairman ?? UNASSIGNED }];
	if (m.openingSong != null) items.push({ label: "Cántico inicial", value: String(m.openingSong) });
	if (m.middleSong != null) items.push({ label: "Cántico intermedio", value: String(m.middleSong) });
	if (m.closingSong != null) items.push({ label: "Cántico final", value: String(m.closingSong) });
	if (!m.skipOpeningPrayer) items.push({ label: "Oración inicial", value: m.openingPrayer ?? UNASSIGNED });
	blocks.push({ type: "keyValue", items });

	const prayers = m.parts.filter((p) => p.sectionType === "prayer");
	const parts = m.parts.filter((p) => p.sectionType !== "prayer");
	blocks.push({
		type: "table",
		table: {
			sheetName: `Entre semana ${m.date}`,
			columns: [
				{ label: "Parte", width: 3 },
				{ label: "Min.", width: 0.6, align: "center" },
				{ label: "Asignado", width: 2 },
				{ label: "Ayudante", width: 2 },
			],
			rows: parts.map((p) => [
				partLabel(p),
				p.durationMinutes ?? "",
				p.main ?? UNASSIGNED,
				p.sectionType === "student_assignment" || p.assistant ? (p.assistant ?? UNASSIGNED) : "",
			]),
		},
	});
	if (prayers.length > 0) {
		blocks.push({
			type: "keyValue",
			items: prayers.map((p, i) => ({
				label: prayers.length > 1 ? `Oración ${i === 0 ? "inicial" : "final"}` : "Oración final",
				value: p.main ?? UNASSIGNED,
			})),
		});
	}
	return blocks;
}

function weekendBlocks(m: WeekendData, time: string | null, headingLevel: 1 | 2): ReportBlock[] {
	const blocks: ReportBlock[] = [{ type: "heading", text: whenLabel(m.date, time), level: headingLevel }];
	if (m.status === "cancelled") {
		blocks.push({ type: "paragraph", text: "Reunión cancelada", muted: true });
		return blocks;
	}
	const speaker = m.speaker
		? m.speakerCongregation
			? `${m.speaker} (${m.speakerCongregation})`
			: m.speaker
		: UNASSIGNED;
	blocks.push({
		type: "table",
		table: {
			sheetName: `Fin de semana ${m.date}`,
			columns: [
				{ label: "Parte", width: 2 },
				{ label: "Asignado", width: 3 },
			],
			rows: [
				["Presidente", m.chairman ?? UNASSIGNED],
				["Discurso público", m.talk ?? UNASSIGNED],
				["Orador", speaker],
				["Conductor de La Atalaya", m.conductor ?? UNASSIGNED],
				["Lector de La Atalaya", m.reader ?? UNASSIGNED],
				["Oración final", m.prayer ?? UNASSIGNED],
			],
		},
	});
	return blocks;
}

export async function buildMeetings(ctx: BuilderContext): Promise<ReportDoc> {
	const { db, session, params } = ctx;
	const kind = params.get("kind");
	const times = await loadMeetingTimes(db);

	if (kind === "meetings-week") {
		const range = parseRange(new URLSearchParams({ date: params.get("date") ?? "", scope: "week" }));
		let canMidweek = true;
		let canWeekend = true;
		try {
			assertCanAccessMidweekModule(session);
		} catch {
			canMidweek = false;
		}
		try {
			assertCanAccessWeekendModule(session);
		} catch {
			canWeekend = false;
		}
		if (!canMidweek && !canWeekend) throw new RbacError("No tienes acceso al módulo de reuniones.");

		const blocks: ReportBlock[] = [];
		if (canMidweek) {
			blocks.push({ type: "heading", text: "Reunión de entre semana", level: 1 });
			const list = await loadMidweek(db, range.from, range.to);
			if (list.length === 0) blocks.push({ type: "paragraph", text: "No hay reunión programada.", muted: true });
			for (const m of list) blocks.push(...midweekBlocks(m, times.midweek, 2));
		}
		if (canWeekend) {
			blocks.push({ type: "heading", text: "Reunión de fin de semana", level: 1 });
			const list = await loadWeekend(db, range.from, range.to);
			if (list.length === 0) blocks.push({ type: "paragraph", text: "No hay reunión programada.", muted: true });
			for (const m of list) blocks.push(...weekendBlocks(m, times.weekend, 2));
		}
		return {
			title: `Reuniones — ${range.label}`,
			fileName: `reuniones-${range.slug}`,
			blocks,
			footer: FOOTER,
		};
	}

	const range = parseRange(params);
	if (kind === "weekend") {
		assertCanAccessWeekendModule(session);
		const list = await loadWeekend(db, range.from, range.to);
		const blocks: ReportBlock[] = [];
		if (list.length === 0) blocks.push({ type: "paragraph", text: "No hay reuniones programadas.", muted: true });
		for (const m of list) blocks.push(...weekendBlocks(m, times.weekend, 2));
		return {
			title: `Reunión de fin de semana — ${range.label}`,
			fileName: `fin-de-semana-${range.slug}`,
			blocks,
			footer: FOOTER,
		};
	}

	assertCanAccessMidweekModule(session);
	const list = await loadMidweek(db, range.from, range.to);
	const blocks: ReportBlock[] = [];
	if (list.length === 0) blocks.push({ type: "paragraph", text: "No hay reuniones programadas.", muted: true });
	list.forEach((m, i) => {
		if (i > 0 && range.scope === "month") blocks.push({ type: "pageBreak" });
		blocks.push(...midweekBlocks(m, times.midweek, 2));
	});
	return {
		title: `Reunión de entre semana — ${range.label}`,
		fileName: `entre-semana-${range.slug}`,
		blocks,
		footer: FOOTER,
	};
}
