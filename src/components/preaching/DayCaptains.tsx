"use client";

import { useEffect, useState } from "react";
import { UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { TERRITORY_KIND_LABEL, type TerritoryKind } from "@/lib/territories/geo";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const KINDS: TerritoryKind[] = ["general", "public_preaching"];

interface Data {
	captains: { weekday: number; kind: TerritoryKind; userId: string; fullName: string }[];
	assignable: Record<TerritoryKind, { id: string; fullName: string }[]>;
}

type Selection = Record<string, string[]>; // `${weekday}|${kind}` → personas

/**
 * Flujo 2 de la predicación: capitanes fijos por día y tipo de territorio. Los días con capitán fijo, al programar una salida solo se
 * elige el territorio y se le asigna al capitán; los días sin capitán siguen con el flujo 1. Quien administra la predicación.
 */
export function DayCaptainsButton({ onSaved }: { onSaved?: () => void }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<IconButton label="Capitanes fijos por día" icon={UserCog} onClick={() => setOpen(true)} />
			{open && (
				<DayCaptainsDialog
					onClose={() => setOpen(false)}
					onSaved={() => {
						setOpen(false);
						onSaved?.();
					}}
				/>
			)}
		</>
	);
}

function DayCaptainsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const [data, setData] = useState<Data | null>(null);
	const [selection, setSelection] = useState<Selection>({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/preaching/captains")
			.then((r) => (r.ok ? r.json() : null))
			.then((body: unknown) => {
				const d = body as Data | null;
				if (!d) return setError("No se pudieron cargar los capitanes.");
				setData(d);
				const sel: Selection = {};
				for (const c of d.captains) (sel[`${c.weekday}|${c.kind}`] ??= []).push(c.userId);
				setSelection(sel);
			})
			.catch(() => setError("No se pudieron cargar los capitanes."));
	}, []);

	const nameOf = (kind: TerritoryKind, id: string) =>
		data?.assignable[kind].find((u) => u.id === id)?.fullName ?? data?.captains.find((c) => c.userId === id)?.fullName ?? "—";

	async function save() {
		setSaving(true);
		setError(null);
		const entries = Object.entries(selection)
			.filter(([, ids]) => ids.length > 0)
			.map(([key, userIds]) => {
				const [weekday, kind] = key.split("|");
				return { weekday: Number(weekday), kind, userIds };
			});
		const res = await fetch("/api/preaching/captains", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ entries }),
		});
		setSaving(false);
		if (!res.ok) {
			setError("No se pudo guardar. Cada capitán debe tener el privilegio «Asignable para territorio» o «… para predicación pública».");
			return;
		}
		onSaved();
	}

	return (
		<Modal open onClose={onClose} title="Capitanes fijos por día">
			{!data ? (
				error ? <p className="text-sm text-red-600">{error}</p> : <PageLoader />
			) : (
				<div className="flex flex-col gap-4">
					<p className="text-sm text-ink-soft">
						Los días con capitán fijo, al programar una salida solo eliges el territorio: se le asigna al capitán y se devuelven los que tenía.
						Los días sin capitán siguen como siempre (territorios ya asignados).
					</p>
					<div className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto">
						{DAYS.map((day, i) => (
							<div key={day} className="rounded-2xl border border-border p-3">
								<p className="mb-2 font-semibold text-ink">{day}</p>
								{KINDS.map((kind) => {
									const key = `${i + 1}|${kind}`;
									const chosen = selection[key] ?? [];
									const free = data.assignable[kind].filter((u) => !chosen.includes(u.id));
									return (
										<div key={kind} className="mb-2 last:mb-0">
											<p className="text-xs font-medium text-ink-soft">{TERRITORY_KIND_LABEL[kind]}</p>
											<div className="mt-1 flex flex-wrap items-center gap-1.5">
												{chosen.map((id) => (
													<span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1 text-sm text-ink">
														{nameOf(kind, id)}
														<button
															type="button"
															aria-label={`Quitar a ${nameOf(kind, id)}`}
															onClick={() => setSelection((s) => ({ ...s, [key]: chosen.filter((x) => x !== id) }))}
															className="text-ink-soft hover:text-ink"
														>
															<X size={14} />
														</button>
													</span>
												))}
												<select
													value=""
													onChange={(e) => e.target.value && setSelection((s) => ({ ...s, [key]: [...chosen, e.target.value] }))}
													className="min-h-9 rounded-full border border-border bg-surface px-3 text-sm text-ink"
												>
													<option value="">{chosen.length ? "Agregar otro…" : "Sin capitán · agregar…"}</option>
													{free.map((u) => (
														<option key={u.id} value={u.id}>
															{u.fullName}
														</option>
													))}
												</select>
											</div>
										</div>
									);
								})}
							</div>
						))}
					</div>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={onClose}>
							Cancelar
						</Button>
						<Button onClick={save} disabled={saving}>
							{saving ? "Guardando..." : "Guardar"}
						</Button>
					</div>
				</div>
			)}
		</Modal>
	);
}
