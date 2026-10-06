// Montos contables se guardan en centavos enteros (ver src/db/schema/congregation.ts
// y maintenance.ts) para que los totales del libro S-26 cuadren exacto — sin
// símbolo de moneda fijo porque la app no asume un único país/divisa.

export function formatCents(cents: number | null | undefined): string {
	if (cents == null) return "—";
	return (cents / 100).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseCentsInput(value: string): number | null {
	if (!value.trim()) return null;
	const parsed = Number(value);
	if (Number.isNaN(parsed)) return null;
	return Math.round(parsed * 100);
}

/** Para el `value` controlado de un `<input>` editable — a diferencia de
 * `formatCents`, no usa "—" como placeholder de vacío. */
export function centsToInputString(cents: number | null | undefined): string {
	if (cents == null) return "";
	return (cents / 100).toFixed(2);
}
