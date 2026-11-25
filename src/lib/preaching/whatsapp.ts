import { time12 } from "@/lib/export/builders/meetingDates";
import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";
import { departureText, type Departure } from "@/lib/territories/geo";

/** Mensaje de WhatsApp de la predicación: «weekday» = lunes a viernes, «weekend» = sábado y domingo. */
export type WhatsAppKind = "weekday" | "weekend";

export interface WhatsAppSession {
	date: string;
	time: string;
	kind: "general" | "public_preaching";
	territories: { number: string; name: string | null; departure: Departure | null }[];
	targets: { congregation: boolean; groups: { name: string }[] };
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Días que cubre el mensaje. `week` = «current» (desde hoy hasta el viernes o el domingo de esta semana; el de entre semana pasa a
 * la próxima si hoy ya es sábado o domingo) o «next» (los días completos de la semana siguiente).
 */
export function whatsappRange(kind: WhatsAppKind, today: string, week: "current" | "next"): { from: string; to: string } {
	const t = parseISODate(today);
	const weekendToday = t.getUTCDay() === 0 || t.getUTCDay() === 6;
	const next = week === "next" || (kind === "weekday" && weekendToday);
	const monday = addDays(mondayOf(t), next ? 7 : 0);
	const start = toISODate(addDays(monday, kind === "weekday" ? 0 : 5));
	const end = toISODate(addDays(monday, kind === "weekday" ? 4 : 6));
	return { from: next || start > today ? start : today, to: end };
}

/** «17 al 20 de noviembre», «29 de noviembre al 2 de diciembre», «22 de noviembre» (y el año si no es el de `today`). */
export function rangeLabel(from: string, to: string, today: string): string {
	const a = parseISODate(from);
	const b = parseISODate(to);
	const year = (d: Date) => (String(d.getUTCFullYear()) !== today.slice(0, 4) ? ` de ${d.getUTCFullYear()}` : "");
	const day = (d: Date) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
	if (from === to) return `${day(a)}${year(a)}`;
	if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} al ${day(b)}${year(b)}`;
	return `${day(a)}${a.getUTCFullYear() !== b.getUTCFullYear() ? year(a) : ""} al ${day(b)}${year(b)}`;
}

/**
 * El texto para el grupo de WhatsApp de la congregación (negritas con *…*, cursivas con _…_): título con el rango de fechas de los
 * días que tienen predicación y, por día, la hora, el territorio y el punto de salida elegido. Null si no hay ninguna salida.
 */
export function buildWhatsAppMessage(kind: WhatsAppKind, sessions: WhatsAppSession[], today: string): string | null {
	const list = [...sessions].sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
	if (list.length === 0) return null;
	const lines: string[] = [
		`*Predicación del ${rangeLabel(list[0].date, list[list.length - 1].date, today)}*`,
		`_${kind === "weekday" ? "Entre semana" : "Fin de semana"}_`,
	];
	let lastDate = "";
	for (const s of list) {
		if (s.date !== lastDate) {
			const d = parseISODate(s.date);
			lines.push("", `*${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}*`);
			lastDate = s.date;
		} else lines.push("");
		const who = s.targets.congregation ? null : s.targets.groups.length ? s.targets.groups.map((g) => g.name).join(", ") : null;
		lines.push(`🕘 ${time12(s.time)}${who ? ` · ${who}` : ""}`);
		const territories = [...s.territories].sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true }));
		for (const t of territories) {
			const label = t.name?.trim() || `Territorio ${t.number}`;
			lines.push(`🗺️ ${s.kind === "public_preaching" ? "Predicación pública: " : ""}${label}`);
			if (t.departure) lines.push(`📍 ${departureText(t.departure)}`);
		}
	}
	return lines.join("\n");
}

/** Enlace que abre WhatsApp con el texto listo para elegir el chat (el grupo de la congregación). */
export function whatsappShareUrl(text: string): string {
	return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
