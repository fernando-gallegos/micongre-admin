import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";

const MONTHS = [
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface DateRange {
	from: string;
	to: string;
	scope: "week" | "month";
	/** "5 al 11 de octubre de 2026" o "octubre de 2026". */
	label: string;
	/** Sufijo seguro para el nombre del archivo. */
	slug: string;
}

function isIso(value: string | null): value is string {
	return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISODate(value).getTime());
}

export function parseRange(params: URLSearchParams, defaultScope: "week" | "month" = "week"): DateRange {
	const rawDate = params.get("date");
	const date = isIso(rawDate) ? rawDate : toISODate(new Date());
	const rawScope = params.get("scope");
	const scope = rawScope === "month" ? "month" : rawScope === "week" ? "week" : defaultScope;
	const d = parseISODate(date);
	if (scope === "month") {
		const y = d.getUTCFullYear();
		const m = d.getUTCMonth();
		const from = toISODate(new Date(Date.UTC(y, m, 1)));
		const to = toISODate(new Date(Date.UTC(y, m + 1, 0)));
		return { from, to, scope, label: `${MONTHS[m]} de ${y}`, slug: `${y}-${String(m + 1).padStart(2, "0")}` };
	}
	const monday = mondayOf(d);
	const from = toISODate(monday);
	const to = toISODate(addDays(monday, 6));
	return { from, to, scope, label: weekLabel(from), slug: from };
}

/** "5 al 11 de octubre de 2026", "28 de septiembre al 4 de octubre de 2026". */
export function weekLabel(mondayISO: string): string {
	const s = parseISODate(mondayISO);
	const e = addDays(s, 6);
	const sd = s.getUTCDate();
	const ed = e.getUTCDate();
	if (s.getUTCFullYear() !== e.getUTCFullYear()) {
		return `${sd} de ${MONTHS[s.getUTCMonth()]} de ${s.getUTCFullYear()} al ${ed} de ${MONTHS[e.getUTCMonth()]} de ${e.getUTCFullYear()}`;
	}
	if (s.getUTCMonth() !== e.getUTCMonth()) {
		return `${sd} de ${MONTHS[s.getUTCMonth()]} al ${ed} de ${MONTHS[e.getUTCMonth()]} de ${e.getUTCFullYear()}`;
	}
	return `${sd} al ${ed} de ${MONTHS[e.getUTCMonth()]} de ${e.getUTCFullYear()}`;
}

/** "martes 6 de octubre de 2026". */
export function dayLabel(iso: string): string {
	const d = parseISODate(iso);
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Hora "HH:MM" (24h) a "7:30 p.m."; si no tiene ese formato se devuelve igual. */
export function time12(value: string | null | undefined): string | null {
	if (!value) return null;
	const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!m) return value;
	const h = Number(m[1]);
	return `${h % 12 || 12}:${m[2]} ${h < 12 ? "a.m." : "p.m."}`;
}
