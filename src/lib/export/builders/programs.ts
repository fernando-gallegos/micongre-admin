// Formatos oficiales: S-140 (Programa para la reunión de entre semana), su equivalente para la reunión del
// fin de semana (mismo diseño) y las papeletas S-89 (Asignación para la reunión Vida y Ministerio Cristianos).
// Cada página es un dibujo SVG de tamaño carta (el navegador lo convierte a imagen o Word).
import { eq } from "drizzle-orm";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import type { Database } from "@/db/client";
import { assertCanAccessMidweekModule, assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { SECTION_LABELS } from "@/lib/rbac/roles";
import type { BuilderContext } from "../registry";
import type { ReportBlock, ReportDoc } from "../types";
import { loadMidweek, loadWeekend, UNASSIGNED, type MidweekData, type MidweekPart, type WeekendData } from "./meetingData";
import { dayLabel, parseRange } from "./meetingDates";

const PAGE_W = 690;
const PAGE_H = 900;
const M = 28; // margen
const FONT = "Arial, Helvetica, sans-serif";
const GRAY = "#575A5D";
const GOLD = "#BE8900";
const WINE = "#7E0024";

function esc(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface TextOpts {
	size?: number;
	bold?: boolean;
	italic?: boolean;
	fill?: string;
	anchor?: "start" | "middle" | "end";
}
function text(x: number, y: number, value: string, o: TextOpts = {}): string {
	return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size ?? 12}" font-weight="${o.bold ? "bold" : "normal"}" font-style="${o.italic ? "italic" : "normal"}" fill="${o.fill ?? GRAY}" text-anchor="${o.anchor ?? "start"}">${esc(value)}</text>`;
}

function clip(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function congregationInfo(db: Database): Promise<{ name: string; midweekStart: number | null; weekendStart: number | null }> {
	const [row] = await db
		.select({ name: congregations.name, s: congregations.meetingSchedules })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	let parsed: { midweek?: { time?: string } | null; weekend?: { time?: string } | null } = {};
	try {
		parsed = row?.s ? JSON.parse(row.s) : {};
	} catch {
		parsed = {};
	}
	const toMin = (t?: string) => {
		const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null;
		return m ? Number(m[1]) * 60 + Number(m[2]) : null;
	};
	return { name: row?.name ?? "Mi congregación", midweekStart: toMin(parsed.midweek?.time), weekendStart: toMin(parsed.weekend?.time) };
}

/** Minutos desde medianoche → «7:30» (reloj de 12 h, sin a. m./p. m., como en el formulario). */
function clock(minutes: number | null): string {
	if (minutes == null) return "0:00";
	const h = Math.floor(minutes / 60) % 24;
	return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
}

function pageHeader(congregation: string, title: string): string[] {
	return [
		text(M, 34, congregation.toUpperCase(), { size: 15, bold: true }),
		text(PAGE_W - M, 34, title, { size: 15, bold: true, anchor: "end" }),
		`<line x1="${M}" y1="44" x2="${PAGE_W - M}" y2="44" stroke="${GRAY}" stroke-width="1.5"/>`,
	];
}

function sectionBar(y: number, label: string, color: string, cols?: { aux: string; main: string }): { parts: string[]; height: number } {
	const parts = [
		`<rect x="${M}" y="${y}" width="${PAGE_W - M * 2}" height="19" rx="3" fill="${color}"/>`,
		text(M + 8, y + 13.5, label, { size: 11.5, bold: true, fill: "#ffffff" }),
	];
	if (cols) {
		parts.push(text(PAGE_W - M - 8 - 150, y + 13.5, cols.aux, { size: 9.5, fill: "#ffffff", anchor: "end" }));
		parts.push(text(PAGE_W - M - 8, y + 13.5, cols.main, { size: 9.5, fill: "#ffffff", anchor: "end" }));
	}
	return { parts, height: 24 };
}

interface RowOpts {
	time?: string;
	title: string;
	main?: string;
	aux?: string;
	/** Etiqueta pequeña sobre los nombres (p. ej. «Estudiante/Ayudante»). */
	role?: string;
	bold?: boolean;
	indent?: boolean;
}
function row(y: number, o: RowOpts, withAux: boolean): { parts: string[]; height: number } {
	const parts: string[] = [];
	if (o.time) parts.push(text(M + 4, y + 11, o.time, { size: 10, fill: "#808080" }));
	parts.push(text(M + 44 + (o.indent ? 0 : 0), y + 11, clip(o.title, withAux ? 62 : 82), { size: 11.5, bold: o.bold }));
	const rightX = PAGE_W - M - 8;
	if (o.main) parts.push(text(rightX, y + 11, clip(o.main, 34), { size: 11.5, anchor: "end" }));
	if (withAux && o.aux) parts.push(text(rightX - 150, y + 11, clip(o.aux, 28), { size: 11.5, anchor: "end" }));
	let height = 19;
	if (o.role) {
		parts.push(text(rightX, y + 22, o.role, { size: 8.5, fill: "#808080", anchor: "end" }));
		height = 27;
	}
	return { parts, height };
}

// --- S-140: reunión de entre semana ---------------------------------------------------

interface Slot {
	number: number | null;
	title: string;
	minutes: number;
	main: MidweekPart | null;
	aux: MidweekPart | null;
}

function pair(p: MidweekPart | null): string {
	if (!p) return "";
	return [p.main ?? UNASSIGNED, p.assistant].filter(Boolean).join(" / ");
}

/** Une las filas de sala principal y auxiliar de una misma parte. */
function slots(parts: MidweekPart[], sectionTypes: string[]): Slot[] {
	const out: Slot[] = [];
	let seq = 0;
	for (const p of parts.filter((x) => sectionTypes.includes(x.sectionType))) {
		const number = p.partNumber;
		const existing = number != null ? out.find((s) => s.number === number && s.title === partTitle(p)) : undefined;
		if (existing && p.room === "auxiliary") {
			existing.aux = p;
			continue;
		}
		seq++;
		out.push({
			number: number ?? null,
			title: partTitle(p),
			minutes: p.durationMinutes ?? 0,
			main: p.room === "auxiliary" ? null : p,
			aux: p.room === "auxiliary" ? p : null,
		});
	}
	void seq;
	return out;
}

function partTitle(p: MidweekPart): string {
	return p.sectionTitle?.trim() || SECTION_LABELS[p.sectionType] || p.sectionType;
}

function midweekWeek(m: MidweekData, y0: number, startMin: number | null): { parts: string[]; height: number } {
	const parts: string[] = [];
	let y = y0;
	const label = (m.weekLabel ?? dayLabel(m.date)).toUpperCase();
	parts.push(text(M, y + 12, label.includes("|") ? label : `${label} | LECTURA SEMANAL DE LA BIBLIA`, { size: 13, bold: true }));
	y += 22;
	if (m.status !== "scheduled") {
		parts.push(text(M, y + 12, "Reunión no programada normalmente esta semana.", { size: 11.5, italic: true }));
		return { parts, height: y + 24 - y0 };
	}
	parts.push(text(M, y + 12, "Presidente:", { size: 11.5, bold: true }), text(M + 74, y + 12, m.chairman ?? UNASSIGNED, { size: 11.5 }));
	if (m.hasAuxRoom) {
		parts.push(
			text(PAGE_W - M - 8 - 100, y + 12, "Consejero de la sala auxiliar:", { size: 11.5, bold: true, anchor: "end" }),
			text(PAGE_W - M - 8, y + 12, "", { size: 11.5, anchor: "end" }),
		);
	}
	y += 24;

	let t = startMin;
	const adv = (minutes: number) => {
		if (t != null) t += minutes;
	};
	const add = (r: { parts: string[]; height: number }) => {
		parts.push(...r.parts);
		y += r.height;
	};
	const withAux = m.hasAuxRoom;
	const prayer = m.parts.find((p) => p.sectionType === "prayer");

	add(row(y, { time: clock(t), title: `Canción${m.openingSong != null ? ` ${m.openingSong}` : ""}`, main: m.skipOpeningPrayer ? undefined : `Oración: ${m.openingPrayer ?? ""}`.trim(), bold: true }, withAux));
	adv(5);
	add(row(y, { time: clock(t), title: "Palabras de introducción (1 min.)" }, withAux));
	adv(1);

	const sections: { label: string; color: string; types: string[]; cols: boolean }[] = [
		{ label: "TESOROS DE LA BIBLIA", color: GRAY, types: ["treasures_talk", "spiritual_gems", "bible_reading"], cols: false },
		{ label: "SEAMOS MEJORES MAESTROS", color: GOLD, types: ["student_assignment"], cols: true },
	];
	for (const s of sections) {
		const list = slots(m.parts, s.types);
		if (list.length === 0) continue;
		const bar = sectionBar(y, s.label, s.color, s.cols && withAux ? { aux: "Sala auxiliar", main: "Auditorio principal" } : undefined);
		parts.push(...bar.parts);
		y += bar.height;
		for (const slot of list) {
			const student = s.cols || slot.main?.sectionType === "bible_reading";
			add(
				row(
					y,
					{
						time: clock(t),
						title: `${slot.number != null ? `${slot.number}. ` : ""}${slot.title}${slot.minutes ? ` (${slot.minutes} mins.)` : ""}`,
						main: pair(slot.main),
						aux: pair(slot.aux),
						role: student && slot.main?.assistant ? "Estudiante/Ayudante" : student ? "Estudiante" : undefined,
					},
					withAux,
				),
			);
			adv(slot.minutes);
		}
	}

	const living = sectionBar(y, "NUESTRA VIDA CRISTIANA", WINE);
	parts.push(...living.parts);
	y += living.height;
	add(row(y, { time: clock(t), title: `Canción${m.middleSong != null ? ` ${m.middleSong}` : ""}`, bold: true }, withAux));
	adv(5);
	for (const slot of slots(m.parts, ["christian_living", "congregation_needs", "living_custom"])) {
		add(
			row(
				y,
				{
					time: clock(t),
					title: `${slot.number != null ? `${slot.number}. ` : ""}${slot.title}${slot.minutes ? ` (${slot.minutes} mins.)` : ""}`,
					main: pair(slot.main),
				},
				withAux,
			),
		);
		adv(slot.minutes);
	}
	const cbs = m.parts.filter((p) => p.sectionType === "cbs");
	if (cbs.length > 0) {
		const conductor = cbs.find((p) => /conductor/i.test(p.sectionTitle ?? "")) ?? cbs[0];
		const reader = cbs.find((p) => /lector/i.test(p.sectionTitle ?? "")) ?? cbs[1];
		const names = [conductor?.main ?? UNASSIGNED, reader?.main ?? UNASSIGNED].join(" / ");
		add(row(y, { time: clock(t), title: "Estudio bíblico de la congregación (30 mins.)", main: names, role: "Conductor/Lector" }, withAux));
		adv(30);
	}
	add(row(y, { time: clock(t), title: "Palabras de conclusión (3 mins.)" }, withAux));
	adv(3);
	add(
		row(
			y,
			{
				time: clock(t),
				title: `Canción${m.closingSong != null ? ` ${m.closingSong}` : ""}`,
				main: `Oración: ${prayer?.main ?? ""}`.trim(),
				bold: true,
			},
			withAux,
		),
	);
	return { parts, height: y - y0 };
}

function pagesOf<T>(items: T[], perPage: number): T[][] {
	const pages: T[][] = [];
	for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
	return pages;
}

function pageBlocks(pages: string[][]): ReportBlock[] {
	const blocks: ReportBlock[] = [];
	pages.forEach((parts, i) => {
		if (i > 0) blocks.push({ type: "pageBreak" });
		blocks.push({
			type: "svg",
			svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}"><rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>${parts.join("")}</svg>`,
			width: PAGE_W,
			height: PAGE_H,
		});
	});
	return blocks;
}

async function buildMidweekProgram({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessMidweekModule(session);
	const range = parseRange(params, "month");
	const [meetings, info] = await Promise.all([loadMidweek(db, range.from, range.to), congregationInfo(db)]);
	const pages: string[][] = pagesOf(meetings, 2).map((weeks) => {
		const parts = pageHeader(info.name, "Programa para la reunión de entre semana");
		let y = 70;
		weeks.forEach((m, i) => {
			if (i > 0) {
				y += 22;
				parts.push(`<line x1="${M}" y1="${y - 10}" x2="${PAGE_W - M}" y2="${y - 10}" stroke="#c9c9c9" stroke-dasharray="4 4"/>`);
			}
			const w = midweekWeek(m, y, info.midweekStart);
			parts.push(...w.parts);
			y += w.height;
		});
		return parts;
	});
	return {
		title: "Programa para la reunión de entre semana",
		subtitle: range.label,
		fileName: `programa-entre-semana-${range.slug}`,
		blocks: pages.length ? pageBlocks(pages) : [{ type: "paragraph", text: "No hay reuniones programadas en este periodo.", muted: true }],
		footer: "Mi Congre",
		bare: true,
	};
}

// --- Programa de la reunión del fin de semana (mismo diseño que el S-140) -----------

function weekendBlock(m: WeekendData, y0: number, startMin: number | null): { parts: string[]; height: number } {
	const parts: string[] = [];
	let y = y0;
	parts.push(text(M, y + 12, `${dayLabel(m.date).toUpperCase()} | REUNIÓN DEL FIN DE SEMANA`, { size: 13, bold: true }));
	y += 22;
	if (m.status !== "scheduled") {
		parts.push(text(M, y + 12, "Reunión no programada normalmente.", { size: 11.5, italic: true }));
		return { parts, height: y + 24 - y0 };
	}
	parts.push(text(M, y + 12, "Presidente:", { size: 11.5, bold: true }), text(M + 74, y + 12, m.chairman ?? UNASSIGNED, { size: 11.5 }));
	y += 24;
	let t = startMin;
	const adv = (minutes: number) => {
		if (t != null) t += minutes;
	};
	const add = (r: { parts: string[]; height: number }) => {
		parts.push(...r.parts);
		y += r.height;
	};

	add(row(y, { time: clock(t), title: "Canción", bold: true }, false));
	adv(5);
	const talk = sectionBar(y, "DISCURSO PÚBLICO", GRAY);
	parts.push(...talk.parts);
	y += talk.height;
	add(
		row(
			y,
			{
				time: clock(t),
				title: m.talk ? `${m.talk} (30 mins.)` : "Discurso público (30 mins.)",
				main: m.speaker ? `${m.speaker}${m.speakerCongregation ? ` (${m.speakerCongregation})` : ""}` : UNASSIGNED,
				role: "Orador",
			},
			false,
		),
	);
	adv(30);
	add(row(y, { time: clock(t), title: "Canción", bold: true }, false));
	adv(5);
	const wt = sectionBar(y, "ESTUDIO DE LA ATALAYA", WINE);
	parts.push(...wt.parts);
	y += wt.height;
	add(
		row(
			y,
			{
				time: clock(t),
				title: "Estudio de La Atalaya (60 mins.)",
				main: `${m.conductor ?? UNASSIGNED} / ${m.reader ?? UNASSIGNED}`,
				role: "Conductor/Lector",
			},
			false,
		),
	);
	adv(60);
	add(row(y, { time: clock(t), title: "Canción", main: `Oración: ${m.prayer ?? ""}`.trim(), bold: true }, false));
	return { parts, height: y - y0 };
}

async function buildWeekendProgram({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessWeekendModule(session);
	const range = parseRange(params, "month");
	const [meetings, info] = await Promise.all([loadWeekend(db, range.from, range.to), congregationInfo(db)]);
	const pages: string[][] = pagesOf(meetings, 3).map((list) => {
		const parts = pageHeader(info.name, "Programa para la reunión del fin de semana");
		let y = 70;
		list.forEach((m, i) => {
			if (i > 0) {
				y += 22;
				parts.push(`<line x1="${M}" y1="${y - 10}" x2="${PAGE_W - M}" y2="${y - 10}" stroke="#c9c9c9" stroke-dasharray="4 4"/>`);
			}
			const w = weekendBlock(m, y, info.weekendStart);
			parts.push(...w.parts);
			y += w.height;
		});
		return parts;
	});
	return {
		title: "Programa para la reunión del fin de semana",
		subtitle: range.label,
		fileName: `programa-fin-de-semana-${range.slug}`,
		blocks: pages.length ? pageBlocks(pages) : [{ type: "paragraph", text: "No hay reuniones programadas en este periodo.", muted: true }],
		footer: "Mi Congre",
		bare: true,
	};
}

// --- S-89: asignación para la reunión Vida y Ministerio Cristianos --------------------

const SLIP_W = 321;
const SLIP_H = 430;
const NOTE = [
	["Nota al estudiante:", " En la ", "Guía de actividades"],
	["encontrará la información que necesita para su"],
	["intervención. Repase también las indicaciones que se"],
	["describen en las "],
];

interface Slip {
	name: string;
	assistant: string | null;
	date: string;
	number: number | null;
	room: "main" | "auxiliary";
}

function slipSvg(s: Slip, x: number, y: number): string {
	const p: string[] = [];
	p.push(`<rect x="${x}" y="${y}" width="${SLIP_W}" height="${SLIP_H}" fill="#ffffff" stroke="#9ca3af" stroke-dasharray="5 4"/>`);
	const cx = x + SLIP_W / 2;
	p.push(text(cx, y + 36, "ASIGNACIÓN PARA LA REUNIÓN", { size: 15, bold: true, fill: "#111111", anchor: "middle" }));
	p.push(text(cx, y + 56, "VIDA Y MINISTERIO CRISTIANOS", { size: 15, bold: true, fill: "#111111", anchor: "middle" }));

	const field = (label: string, value: string, fy: number, labelW: number) => {
		p.push(text(x + 16, fy, label, { size: 14, bold: true, fill: "#111111" }));
		p.push(`<line x1="${x + 16 + labelW}" y1="${fy + 2}" x2="${x + SLIP_W - 16}" y2="${fy + 2}" stroke="#111111" stroke-width="1" stroke-dasharray="1.5 2"/>`);
		p.push(text(x + 20 + labelW, fy - 2, clip(value, 28), { size: 13, fill: "#111111" }));
	};
	field("Nombre:", s.name, y + 100, 66);
	field("Ayudante:", s.assistant ?? "", y + 134, 76);
	field("Fecha:", dayLabel(s.date), y + 168, 52);
	field("Intervención núm.:", s.number != null ? String(s.number) : "", y + 202, 132);

	p.push(text(x + 16, y + 250, "Se presentará en:", { size: 14, bold: true, fill: "#111111" }));
	const boxes: { label: string; on: boolean }[] = [
		{ label: "Sala principal", on: s.room === "main" },
		{ label: "Sala auxiliar núm. 1", on: s.room === "auxiliary" },
		{ label: "Sala auxiliar núm. 2", on: false },
	];
	boxes.forEach((b, i) => {
		const by = y + 266 + i * 22;
		p.push(`<rect x="${x + 30}" y="${by}" width="13" height="13" fill="none" stroke="#111111" stroke-width="1"/>`);
		if (b.on) p.push(`<path d="M${x + 32} ${by + 7} L${x + 36} ${by + 11} L${x + 42} ${by + 2}" fill="none" stroke="#111111" stroke-width="2"/>`);
		p.push(text(x + 52, by + 11, b.label, { size: 13, fill: "#111111" }));
	});

	const note = [
		"<tspan font-weight=\"bold\">Nota al estudiante:</tspan> En la <tspan font-style=\"italic\">Guía de actividades</tspan>",
		"encontrará la información que necesita para su",
		"intervención. Repase también las indicaciones que se",
		"describen en las <tspan font-style=\"italic\">Instrucciones para la reunión Vida y</tspan>",
		"<tspan font-style=\"italic\">Ministerio Cristianos</tspan> (S-38).",
	];
	note.forEach((line, i) => {
		p.push(
			`<text x="${x + 16}" y="${y + 338 + i * 14}" font-family="${FONT}" font-size="10" fill="#111111">${line}</text>`,
		);
	});
	p.push(text(x + 16, y + SLIP_H - 10, "S-89-S   11/23", { size: 9, fill: "#555555" }));
	void NOTE;
	return p.join("");
}

async function buildS89({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessMidweekModule(session);
	const range = parseRange(params, "week");
	const meetings = await loadMidweek(db, range.from, range.to);
	const slips: Slip[] = [];
	for (const m of meetings) {
		if (m.status !== "scheduled") continue;
		for (const p of m.parts) {
			if ((p.sectionType !== "bible_reading" && p.sectionType !== "student_assignment") || !p.main) continue;
			slips.push({ name: p.main, assistant: p.assistant, date: m.date, number: p.partNumber, room: p.room });
		}
	}
	const perPage = 4;
	const pages = pagesOf(slips, perPage).map((list) =>
		list.map((s, i) => slipSvg(s, M + 6 + (i % 2) * (SLIP_W + 6), 12 + Math.floor(i / 2) * (SLIP_H + 8))),
	);
	return {
		title: "Asignaciones para la reunión Vida y Ministerio Cristianos (S-89)",
		subtitle: range.label,
		fileName: `s-89-${range.slug}`,
		blocks: pages.length
			? pageBlocks(pages)
			: [{ type: "paragraph", text: "Todavía no hay estudiantes asignados en este periodo.", muted: true }],
		footer: "Mi Congre",
		bare: true,
	};
}

export async function buildPrograms(ctx: BuilderContext): Promise<ReportDoc> {
	switch (ctx.params.get("kind")) {
		case "s140":
			return buildMidweekProgram(ctx);
		case "weekend-program":
			return buildWeekendProgram(ctx);
		default:
			return buildS89(ctx);
	}
}
