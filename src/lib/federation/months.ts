export const MONTH_NAMES = [
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

export function monthLabel(year: number, month: number): string {
	return `${MONTH_NAMES[month - 1] ?? month} de ${year}`;
}
