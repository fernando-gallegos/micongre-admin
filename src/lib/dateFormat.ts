// Estándar de fecha de toda la app (pedido explícito): "dd/MMM/yyyy" para
// texto en línea/metadatos, "dd/MMM/yyyy hh:mm a.m./p.m." cuando lleva hora,
// y la fecha larga en español ("24 de septiembre de 2026") solo cuando la
// fecha ES el título de una sección o página. Nada de Intl.DateTimeFormat
// suelto por componente — así un cambio de formato no queda regado.

const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG_ES = [
	"enero",
	"febrero",
	"marzo",
	"abril",
	"mayo",
	"junio",
	"julio",
	"agosto",
	"septiembre",
	"octubre",
	"noviembre",
	"diciembre",
];

// Muchos campos de la app son fechas puras "YYYY-MM-DD" (requestedDate,
// meetingDate, expiresAt, birthDate...) sin componente de hora — un
// new Date("YYYY-MM-DD") se interpreta como medianoche UTC, así que leer el
// día con getDate() (hora local) puede mostrar el día anterior en cualquier
// zona horaria negativa. Para esas, se leen los componentes directo del
// string en vez de pasar por Date. Para timestamps reales (createdAt, "ahora"),
// sí se usa la hora local del que mira la pantalla.
function dateParts(value: string | number | Date): { yyyy: number; mm: number; dd: number } {
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !/\d{4}-\d{2}-\d{2}T/.test(value)) {
		const [yyyy, mm, dd] = value.slice(0, 10).split("-").map(Number);
		return { yyyy, mm: mm - 1, dd };
	}
	const date = value instanceof Date ? value : new Date(value);
	return { yyyy: date.getFullYear(), mm: date.getMonth(), dd: date.getDate() };
}

/** "27/sep/2026" — fechas en línea, tablas, tarjetas, metadatos. */
export function formatShortDate(value: string | number | Date): string {
	const { yyyy, mm, dd } = dateParts(value);
	return `${String(dd).padStart(2, "0")}/${MONTHS_SHORT_ES[mm]}/${yyyy}`;
}

/** "27/sep" — sin año, para un extremo de un rango dentro del mismo mes
 * (ver formatWeekRangeShort en src/lib/mwb/dates.ts). */
export function formatShortDayMonth(value: string | number | Date): string {
	const { mm, dd } = dateParts(value);
	return `${String(dd).padStart(2, "0")}/${MONTHS_SHORT_ES[mm]}`;
}

/** "27/sep/2026 09:35 a.m." — igual que formatShortDate, con hora de 12h.
 * Solo tiene sentido para timestamps reales (con hora), no fechas puras. */
export function formatShortDateTime(value: string | number | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	const ampm = date.getHours() < 12 ? "a.m." : "p.m.";
	const hh = String(date.getHours() % 12 || 12).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	return `${formatShortDate(value)} ${hh}:${min} ${ampm}`;
}

/** "24 de Septiembre de 2026" (mes con mayúscula, tal como se pidió) — solo
 * cuando la fecha ES el título de una sección o página (p. ej. el encabezado
 * de Mi Panel); nunca para texto en línea, ahí va formatShortDate. */
export function formatLongDate(value: string | number | Date): string {
	const { yyyy, mm, dd } = dateParts(value);
	const month = MONTHS_LONG_ES[mm];
	return `${dd} de ${month.charAt(0).toUpperCase()}${month.slice(1)} de ${yyyy}`;
}

/** "09:35 a.m." — para un campo de hora suelto tipo `<input type="time">`
 * ("HH:MM" 24h, sin fecha), como la hora de un discurso de visita. */
export function formatTime12h(hhmm: string): string {
	const [h, min] = hhmm.split(":").map(Number);
	const ampm = h < 12 ? "a.m." : "p.m.";
	const hh = String(h % 12 || 12).padStart(2, "0");
	return `${hh}:${String(min).padStart(2, "0")} ${ampm}`;
}
