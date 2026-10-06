"use client";

import type { EligibleUser } from "@/lib/rbac/eligibility";

/** Presentacional — recibe la lista de elegibles ya resuelta por el
 * contenedor (que las trae en un solo request batcheado por privilegeId,
 * ver WeekBuilder). No hace su propio fetch para no repetir la misma
 * consulta una vez por fila cuando varias filas comparten privilegio (p. ej.
 * varias partes de estudiante). Se ve como una píldora: la persona asignada, o
 * "Sin asignar" punteada en color de aviso. */
export function BrotherSelector({
	label,
	value,
	options,
	loading,
	excludeUserId,
	placeholder = "Sin asignar",
	warning,
	onChange,
}: {
	label?: string;
	value: string | null;
	options: EligibleUser[];
	loading?: boolean;
	excludeUserId?: string | null;
	placeholder?: string;
	/** Aviso no bloqueante bajo el combo (p. ej. ya tiene otra asignación el mismo día). */
	warning?: string | null;
	onChange: (userId: string | null) => void;
}) {
	const filtered = excludeUserId ? options.filter((o) => o.id !== excludeUserId) : options;
	const empty = !value;

	return (
		<label className="flex min-w-0 flex-col gap-1 text-sm">
			{label && <span className="px-1 text-xs font-medium text-ink-soft">{label}</span>}
			<select
				value={value ?? ""}
				disabled={loading}
				onChange={(e) => onChange(e.target.value || null)}
				className={`min-h-11 w-full min-w-0 max-w-full truncate rounded-full border bg-transparent px-4 py-2 text-base font-medium focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm ${
					empty ? "border-dashed border-warn/50 text-warn" : "border-border text-ink"
				}`}
			>
				<option value="">{loading ? "Cargando..." : placeholder}</option>
				{filtered.map((o) => (
					<option key={o.id} value={o.id}>
						{o.fullName}
					</option>
				))}
			</select>
			{warning && <span className="px-1 text-xs text-warn">{warning}</span>}
		</label>
	);
}
