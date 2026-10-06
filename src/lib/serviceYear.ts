/**
 * Año de servicio: va de septiembre a agosto del año siguiente, nombrado por
 * el año en que cae septiembre (p. ej. "año de servicio 2026" = sept. 2026 a
 * ago. 2027). Solo lo usa la tarjeta S-21 — el resto de la app (informes S-4)
 * trabaja por mes/año calendario porque los informes se llenan mes a mes.
 */
export function getServiceYear(calendarYear: number, calendarMonth: number): number {
	return calendarMonth >= 9 ? calendarYear : calendarYear - 1;
}

export function getCurrentServiceYear(): number {
	const now = new Date();
	return getServiceYear(now.getFullYear(), now.getMonth() + 1);
}

/** El año calendario real de un mes dentro de un año de servicio dado —
 * septiembre-diciembre caen en el año de servicio, enero-agosto en el
 * siguiente. */
export function calendarYearForServiceMonth(serviceYear: number, calendarMonth: number): number {
	return calendarMonth >= 9 ? serviceYear : serviceYear + 1;
}

export const SERVICE_YEAR_MONTHS = [
	{ month: 9, label: "Septiembre" },
	{ month: 10, label: "Octubre" },
	{ month: 11, label: "Noviembre" },
	{ month: 12, label: "Diciembre" },
	{ month: 1, label: "Enero" },
	{ month: 2, label: "Febrero" },
	{ month: 3, label: "Marzo" },
	{ month: 4, label: "Abril" },
	{ month: 5, label: "Mayo" },
	{ month: 6, label: "Junio" },
	{ month: 7, label: "Julio" },
	{ month: 8, label: "Agosto" },
] as const;
