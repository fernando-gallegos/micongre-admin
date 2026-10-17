"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { formatShortDayMonth } from "@/lib/dateFormat";
import type { AutoAssignModule, AutoAssignResult } from "@/lib/assignments/plan";

type Slot = AutoAssignResult["slots"][number];

function candidateLabel(c: Slot["candidates"][number]): string {
	const times = c.count === 1 ? "1 vez" : `${c.count} veces`;
	return `${c.name} · ${times}${c.last ? ` · última ${formatShortDayMonth(c.last)}` : ""}${c.busy ? " · ya tiene algo ese día" : ""}`;
}

/** Botón «Asignar automáticamente»: abre una vista previa con la propuesta para cada asignación vacía (con los candidatos y sus números de los
 * últimos 3 meses). Al aplicar, `onApply` recibe `clave de casilla → persona` y la pantalla lo vuelca a su borrador; se guarda con «Guardar». */
export function AutoAssignButton({
	module,
	meetingId,
	onApply,
	disabled,
	disabledReason,
}: {
	module: AutoAssignModule;
	meetingId: string;
	onApply: (picks: Record<string, string>) => void;
	/** Hay cambios sin guardar: la propuesta se calcula con lo guardado, así que primero hay que guardar. */
	disabled?: boolean;
	disabledReason?: string;
}) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<AutoAssignResult | null>(null);
	const [picks, setPicks] = useState<Record<string, string>>({});

	useEffect(() => {
		if (!open) return;
		let active = true;
		setLoading(true);
		setError(null);
		setResult(null);
		fetch("/api/assignments/suggest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ module, meetingId }),
		})
			.then(async (response) => {
				if (!response.ok) throw new Error(response.status === 403 ? "No tienes permiso para esto." : "No se pudo calcular la propuesta.");
				return (await response.json()) as AutoAssignResult;
			})
			.then((body) => {
				if (!active) return;
				setResult(body);
				setPicks(Object.fromEntries(body.slots.filter((s) => s.suggestion).map((s) => [s.key, s.suggestion!.id])));
			})
			.catch((e: Error) => active && setError(e.message))
			.finally(() => active && setLoading(false));
		return () => {
			active = false;
		};
	}, [open, module, meetingId]);

	const groups = useMemo(() => {
		const map = new Map<string, Slot[]>();
		for (const slot of result?.slots ?? []) {
			const name = slot.group ?? "";
			(map.get(name) ?? map.set(name, []).get(name)!).push(slot);
		}
		return [...map.entries()];
	}, [result]);

	// Una misma persona en dos casillas de esta reunión: se avisa (se puede dejar, es solo un aviso).
	const duplicates = useMemo(() => {
		const counts = new Map<string, number>();
		for (const id of Object.values(picks)) counts.set(id, (counts.get(id) ?? 0) + 1);
		return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
	}, [picks]);

	const chosen = Object.keys(picks).length;

	return (
		<>
			<IconButton
				label={disabled ? (disabledReason ?? "Guarda los cambios para asignar automáticamente") : "Asignar automáticamente"}
				icon={Wand2}
				disabled={disabled}
				onClick={() => setOpen(true)}
			/>
			<Modal open={open} onClose={() => setOpen(false)} title="Asignar automáticamente">
				<div className="flex flex-col gap-4">
					{loading && (
						<p className="flex items-center gap-2 text-sm text-ink-soft">
							<Loader2 size={16} className="animate-spin" /> Calculando la propuesta…
						</p>
					)}
					{error && <p className="text-sm text-red-600">{error}</p>}
					{result && (
						<>
							<p className="text-xs text-ink-soft">
								Se propone a quien menos veces ha tenido cada asignación en los últimos 3 meses ({formatShortDayMonth(result.window.from)} –{" "}
								{formatShortDayMonth(result.window.to)}), solo entre quienes pueden hacerla y no tienen otra asignación en esta reunión.
								{result.alreadyAssigned > 0 && ` Lo que ya está asignado (${result.alreadyAssigned}) no se toca.`} Puedes cambiar a cualquiera antes de aplicar.
							</p>
							{result.slots.length === 0 && <p className="text-sm text-ink">No hay asignaciones vacías en esta reunión.</p>}
							{groups.map(([group, slots]) => (
								<section key={group} className="flex flex-col gap-3">
									{group && <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">{group}</h3>}
									{slots.map((slot) => {
										const picked = slot.candidates.find((c) => c.id === picks[slot.key]);
										return (
											<div key={slot.key} className="flex flex-col gap-1">
												<Select
													label={slot.label}
													value={picks[slot.key] ?? ""}
													disabled={slot.candidates.length === 0}
													onChange={(e) =>
														setPicks((p) => {
															const next = { ...p };
															if (e.target.value) next[slot.key] = e.target.value;
															else delete next[slot.key];
															return next;
														})
													}
												>
													<option value="">{slot.candidates.length === 0 ? "Sin candidatos" : "Dejar sin asignar"}</option>
													{slot.candidates.map((c) => (
														<option key={c.id} value={c.id}>
															{candidateLabel(c)}
														</option>
													))}
												</Select>
												{slot.note && <p className="text-xs text-ink-soft">{slot.note}</p>}
												{picked && duplicates.has(picked.id) && (
													<p className="text-xs text-warn">{picked.name} quedó en más de una asignación de esta reunión.</p>
												)}
											</div>
										);
									})}
								</section>
							))}
							<div className="flex flex-wrap justify-end gap-2 pt-2">
								<Button variant="secondary" onClick={() => setOpen(false)}>
									Cancelar
								</Button>
								<Button
									disabled={chosen === 0}
									onClick={() => {
										onApply(picks);
										setOpen(false);
									}}
								>
									Aplicar{chosen > 0 ? ` (${chosen})` : ""}
								</Button>
							</div>
							<p className="text-xs text-ink-soft">«Aplicar» solo llena la pantalla; no se guarda nada hasta que presiones «Guardar».</p>
						</>
					)}
				</div>
			</Modal>
		</>
	);
}
