"use client";

import { useMemo } from "react";
import { Combobox } from "@/components/ui/Combobox";
import type { EligibleUser } from "@/lib/rbac/eligibility";

/** Selector de personas con buscador (ver Combobox). Recibe la lista de elegibles ya resuelta por el contenedor (que las trae en un
 * solo request batcheado por privilegeId, ver WeekBuilder); no hace su propio fetch para no repetir la misma consulta una vez por
 * fila cuando varias filas comparten privilegio. Se ve como una píldora: la persona asignada, o "Sin asignar" punteada en color de
 * aviso. */
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
	const filtered = useMemo(() => (excludeUserId ? options.filter((o) => o.id !== excludeUserId) : options), [options, excludeUserId]);
	const selected = value ? filtered.find((o) => o.id === value) : undefined;
	const empty = !value;
	// Con una asignación guardada que ya no está en la lista de elegibles (cambió su privilegio) se avisa en vez de mostrar "Sin asignar".
	const stale = !!value && !selected && !loading && filtered.length > 0;
	const comboOptions = useMemo(() => [{ value: "", label: placeholder }, ...filtered.map((o) => ({ value: o.id, label: o.fullName }))], [filtered, placeholder]);
	const text = loading ? "Cargando..." : selected ? selected.fullName : stale ? "Asignación no válida" : placeholder;

	return (
		<div className="flex min-w-0 flex-col gap-1 text-sm">
			{label && <span className="px-1 text-xs font-medium text-ink-soft">{label}</span>}
			<Combobox
				options={comboOptions}
				value={value ?? ""}
				onChange={(next) => onChange(next || null)}
				triggerText={text}
				disabled={loading}
				searchable={filtered.length > 7}
				ariaLabel={label}
				triggerClassName={`min-h-11 w-full min-w-0 max-w-full rounded-full border bg-transparent px-4 py-2 text-base font-medium focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm ${
					empty || stale ? "border-dashed border-warn/50 text-warn" : "border-border text-ink"
				}`}
			/>
			{warning && <span className="px-1 text-xs text-warn">{warning}</span>}
		</div>
	);
}
