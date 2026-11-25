// Vista mensual de los planificadores: una fila por asignación (lo que dicen la plantilla o las partes) y una columna por reunión. Cada
// reunión aporta sus filas en su orden; aquí se juntan en un solo orden sin repetir.

export interface PlannerRow {
	key: string;
	label: string;
	group?: string;
}

/**
 * Junta las listas de filas de cada reunión en un solo orden sin repetir: se respeta el orden de cada una, y una fila que aún no estaba se
 * pone justo antes de la siguiente fila conocida de su reunión (o al final si no hay).
 */
export function mergeRowOrder(lists: PlannerRow[][]): PlannerRow[] {
	const out: PlannerRow[] = [];
	const known = new Set<string>();
	for (const list of lists) {
		list.forEach((row, i) => {
			if (known.has(row.key)) return;
			const nextKnown = list.slice(i + 1).find((r) => known.has(r.key));
			const at = nextKnown ? out.findIndex((r) => r.key === nextKnown.key) : out.length;
			out.splice(at, 0, row);
			known.add(row.key);
		});
	}
	return out;
}

/** Clave estable para la n-ésima repetición (0, 1, …) de una misma base dentro de una reunión. */
export function numbered<T>(items: T[], base: (item: T) => string): { item: T; key: string; n: number }[] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const b = base(item);
		const n = seen.get(b) ?? 0;
		seen.set(b, n + 1);
		return { item, key: `${b}#${n}`, n };
	});
}
