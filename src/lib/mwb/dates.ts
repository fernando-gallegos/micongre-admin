// Helpers de fechas para la navegación semanal y la importación del programa
// mwb — puros (sin I/O), así se pueden usar tanto en cliente como en servidor.

import { formatShortDate, formatShortDayMonth } from "@/lib/dateFormat";

export function toISODate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

/** Lunes (00:00 UTC) de la semana que contiene `date`. */
export function mondayOf(date: Date): Date {
	const day = date.getUTCDay(); // 0=domingo … 6=sábado
	const diff = day === 0 ? -6 : 1 - day;
	const monday = addDays(date, diff);
	monday.setUTCHours(0, 0, 0, 0);
	return monday;
}

export function parseISODate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

/** "06/oct - 12/oct" dentro del mismo mes; "28/sep - 04/oct de 2026" si cae
 * entre 2 meses del mismo año; y "28/dic/2026 - 03/ene/2027" (año en ambos
 * extremos) solo si cruza de año. */
export function formatWeekRangeEs(mondayISO: string): string {
	const start = parseISODate(mondayISO);
	const end = addDays(start, 6);
	const startISO = toISODate(start);
	const endISO = toISODate(end);

	if (start.getUTCFullYear() !== end.getUTCFullYear()) {
		return `${formatShortDate(startISO)} - ${formatShortDate(endISO)}`;
	}
	if (start.getUTCMonth() === end.getUTCMonth()) {
		return `${formatShortDayMonth(startISO)} - ${formatShortDayMonth(endISO)}`;
	}
	return `${formatShortDayMonth(startISO)} - ${formatShortDayMonth(endISO)} de ${end.getUTCFullYear()}`;
}

/** Todos los lunes (ISO) del mes de calendario del lunes dado. Cada semana
 * cuenta en el mes de su lunes, igual que `issueCodeForWeek`, así todas caen
 * en el mismo número bimestral de la guía. */
export function weekStartsOfMonth(mondayISO: string): string[] {
	const monday = parseISODate(mondayISO);
	const month = monday.getUTCMonth();
	let cursor = monday;
	while (addDays(cursor, -7).getUTCMonth() === month) cursor = addDays(cursor, -7);
	const weeks: string[] = [];
	while (cursor.getUTCMonth() === month) {
		weeks.push(toISODate(cursor));
		cursor = addDays(cursor, 7);
	}
	return weeks;
}

/** Código de número bimestral (YYYYMM) de la guía mwb que contiene esa semana
 * — los números cubren meses impares+pares consecutivos (ene-feb, mar-abr, …). */
export function issueCodeForWeek(mondayISO: string): string {
	const monday = parseISODate(mondayISO);
	const year = monday.getUTCFullYear();
	const month = monday.getUTCMonth() + 1;
	const oddMonth = month % 2 === 0 ? month - 1 : month;
	return `${year}${String(oddMonth).padStart(2, "0")}`;
}
