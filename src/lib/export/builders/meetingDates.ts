import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";

const MONTHS = [
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface DateRange {
	from: string;
	to: string;
	scope: "week" | "month" | "range";
	/** "5 al 11 de octubre de 2026", "octubre de 2026" o "2 de diciembre de 2026 al 3 de enero de 2027". */
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
	// Rango de fechas libre (del día «from» al día «to», incluidos), hasta MAX_RANGE_DAYS.
	const rawFrom = params.get("from");
	const rawTo = params.get("to");
	if (rawScope === "range" && isIso(rawFrom) && isIso(rawTo)) {
		let [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
		const maxTo = toISODate(addDays(parseISODate(from), MAX_RANGE_DAYS - 1));
		if (to > maxTo) to = maxTo;
		return { from, to, scope: "range", label: rangeLabel(from, to), slug: `${from}_${to}` };
	}
	const scope = rawScope === "month" ? "month" : rawScope === "week" ? "week" : defaultScope;
	const d = parseISODate(date);
	if (scope === "month") {
		const y = d.getUTCFullYear();
		const m = d.getUTCMonth();
		// Cada semana cuenta en el mes de su lunes: del primer lunes del mes al domingo de la semana del último lunes.
		const first = new Date(Date.UTC(y, m, 1));
		const firstMonday = addDays(first, (8 - first.getUTCDay()) % 7);
		const nextFirst = new Date(Date.UTC(y, m + 1, 1));
		const nextMonday = addDays(nextFirst, (8 - nextFirst.getUTCDay()) % 7);
		const from = toISODate(firstMonday);
		const to = toISODate(addDays(nextMonday, -1));
		return { from, to, scope, label: `${MONTHS[m]} de ${y}`, slug: `${y}-${String(m + 1).padStart(2, "0")}` };
	}
	const monday = mondayOf(d);
	const from = toISODate(monday);
	const to = toISODate(addDays(monday, 6));
	return { from, to, scope, label: weekLabel(from), slug: from };
}

/**
 * Fechas para buscar programas por semana (entre semana se guarda con el lunes): con un rango libre se toman las semanas completas que toca
 * (del lunes de «from» al domingo de la semana de «to»); semana y mes ya son semanas completas.
 */
export function weekSpan(range: DateRange): { from: string; to: string } {
	if (range.scope !== "range") return { from: range.from, to: range.to };
	return { from: toISODate(mondayOf(parseISODate(range.from))), to: toISODate(addDays(mondayOf(parseISODate(range.to)), 6)) };
}

/** Lo más largo que puede abarcar un rango de fechas (unos 6 meses). */
export const MAX_RANGE_DAYS = 186;

/** "5 al 11 de octubre de 2026", "28 de septiembre al 4 de octubre de 2026". */
export function weekLabel(mondayISO: string): string {
	return rangeLabel(mondayISO, toISODate(addDays(parseISODate(mondayISO), 6)));
}

/** "2 al 20 de diciembre de 2026", "2 de diciembre de 2026 al 3 de enero de 2027", "5 de octubre de 2026" (un solo día). */
export function rangeLabel(fromISO: string, toISO: string): string {
	const s = parseISODate(fromISO);
	const e = parseISODate(toISO);
	if (fromISO === toISO) return `${s.getUTCDate()} de ${MONTHS[s.getUTCMonth()]} de ${s.getUTCFullYear()}`;
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
