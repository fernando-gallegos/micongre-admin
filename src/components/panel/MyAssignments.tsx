"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Map as MapIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { TerritoryMapViewer } from "@/components/territories/TerritoryMapViewer";
import { formatShortDate } from "@/lib/dateFormat";
import type { DepartureChoice, PanelAssignment } from "@/lib/queries/panel";
import { departureText } from "@/lib/territories/geo";

const MEETING_TYPE_LABEL: Record<string, string> = {
	midweek: "Entre semana",
	weekend: "Fin de semana",
	operational: "Acomodadores",
	outgoing_talk: "Discurso enviado",
	preaching: "Predicación",
	pastoral_visit: "Pastoreo",
	pastoral_visit_request: "Pastoreo",
	cleaning: "Salón del Reino",
	territory: "Territorio",
};

type Resolution = "completed" | "returned";

const RESOLUTION_TEXT: Record<Resolution, { title: string; question: string; confirm: string }> = {
	completed: { title: "Completar territorio", question: "¿Marcar como completado el", confirm: "Completar" },
	returned: { title: "Devolver territorio", question: "¿Devolver el", confirm: "Devolver" },
};

type TerritoryInfo = NonNullable<PanelAssignment["territory"]>;

export function MyAssignments({
	title,
	items,
	emptyLabel,
	onChange,
	past = false,
}: {
	title: string;
	items: PanelAssignment[];
	emptyLabel: string;
	/** Se llama cuando una acción cambia las asignaciones (p. ej. completar un territorio). */
	onChange?: () => void;
	/** Historial: el título va tachado (ya pasó). */
	past?: boolean;
}) {
	const [mapFor, setMapFor] = useState<string | null>(null);
	const [resolving, setResolving] = useState<{ item: PanelAssignment; status: Resolution } | null>(null);
	const [comment, setComment] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function startResolve(item: PanelAssignment, status: Resolution) {
		setResolving({ item, status });
		setComment("");
		setError(null);
	}

	async function confirmResolve() {
		const territory = resolving?.item.territory;
		if (!resolving || !territory) return;
		setSaving(true);
		setError(null);
		const response = await fetch(`/api/territories/assignments/${territory.assignmentId}/resolve`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: resolving.status, comment: comment.trim() || null }),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar. Intenta de nuevo.");
			return;
		}
		setResolving(null);
		onChange?.();
	}

	return (
		<section>
			<SectionLabel right={items.length > 0 ? items.length : undefined}>{title}</SectionLabel>
			{items.length === 0 ? (
				<List>
					<p className="px-4 py-5 text-sm text-ink-soft">{emptyLabel}</p>
				</List>
			) : (
				<List>
					{items.map((item, i) => {
						const territory: TerritoryInfo | undefined = item.territory;
						const pending = territory?.status === "assigned";
						const dates = item.dateEnd
							? `${formatShortDate(item.date)} al ${formatShortDate(item.dateEnd)}`
							: formatShortDate(item.date);
						return (
							<div key={i} className="flex items-center gap-1 py-3 pl-4 pr-2">
								<TextBlock openDate={past ? undefined : item.openDate}>
									{pending ? (
										<p className="text-xs font-semibold text-warn">
											Pendiente{item.openDate ? ` · ${formatShortDate(item.openDate)}` : ""}
										</p>
									) : (
										<p className="text-xs font-semibold text-ink-soft">
											{dates} · {MEETING_TYPE_LABEL[item.meetingType]}
										</p>
									)}
									<p className={`mt-0.5 text-base font-semibold text-ink ${past ? "line-through" : ""}`}>{item.label}</p>
									{item.detail && <p className="mt-0.5 whitespace-pre-line text-[13px] text-ink-soft">{item.detail}</p>}
									{item.departureChoices?.map((c) => (
										<DepartureSelect key={`${c.sessionId}-${c.territoryId}`} choice={c} many={item.departureChoices!.length > 1} onChanged={onChange} />
									))}
									{pending && <p className="mt-0.5 text-[13px] text-ink-soft">Asignado el {dates}</p>}
									{territory && !pending && territory.comment && (
										<p className="mt-0.5 text-[13px] text-ink-soft">«{territory.comment}»</p>
									)}
								</TextBlock>
								{item.mapUrl && (
									<a
										href={item.mapUrl}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="Ver la ubicación en el mapa"
										title="Ver la ubicación en el mapa"
										className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt"
									>
										<MapIcon size={20} />
									</a>
								)}
								{/* Salida de predicación con un territorio dibujado que la persona puede ver. */}
								{!territory && item.mapTerritoryId && (
									<IconButton label="Ver el mapa del territorio" icon={MapIcon} onClick={() => setMapFor(item.mapTerritoryId!)} />
								)}
								{territory && pending && (
									<>
										<IconButton label="Ver el mapa" icon={MapIcon} onClick={() => setMapFor(territory.territoryId)} />
										<IconButton
											label="Completar: ya terminé de trabajar este territorio"
											icon={Check}
											tone="accent"
											onClick={() => startResolve(item, "completed")}
										/>
										<IconButton
											label="Devolver: no lo trabajé o lo dejo, regresa al siervo de territorios"
											icon={Undo2}
											onClick={() => startResolve(item, "returned")}
										/>
									</>
								)}
							</div>
						);
					})}
				</List>
			)}

			{mapFor && <TerritoryMapViewer territoryId={mapFor} onClose={() => setMapFor(null)} />}

			{resolving && (
				<Modal open onClose={() => setResolving(null)} title={RESOLUTION_TEXT[resolving.status].title}>
					<div className="flex flex-col gap-4">
						<p className="text-sm text-ink">
							{RESOLUTION_TEXT[resolving.status].question} <span className="font-semibold">{resolving.item.label}</span>?
						</p>
						<label className="flex flex-col gap-1 text-sm">
							<span className="font-medium text-ink">Comentario (opcional)</span>
							<textarea
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								maxLength={500}
								rows={3}
								autoFocus
								className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
							/>
						</label>
						{error && <p className="text-sm text-red-600">{error}</p>}
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setResolving(null)}>
								Cancelar
							</Button>
							<Button onClick={confirmResolve} disabled={saving}>
								{saving ? "Guardando..." : RESOLUTION_TEXT[resolving.status].confirm}
							</Button>
						</div>
					</div>
				</Modal>
			)}
		</section>
	);
}

/** El capitán elige el punto de salida de ese día (antes de la salida o hasta 2 horas después). Al cambiarlo se reenvía el aviso. */
function DepartureSelect({ choice, many, onChanged }: { choice: DepartureChoice; many: boolean; onChanged?: () => void }) {
	const [value, setValue] = useState(choice.currentFid ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function change(fid: string) {
		const previous = value;
		setValue(fid);
		setBusy(true);
		setError(null);
		const response = await fetch(`/api/preaching/${choice.sessionId}/departure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ territoryId: choice.territoryId, fid }),
		});
		setBusy(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			setValue(previous);
			setError(body?.error === "departure_locked" ? "Ya no se puede cambiar: pasaron más de 2 horas desde la salida." : "No se pudo cambiar el punto de salida.");
			return;
		}
		onChanged?.();
	}

	return (
		<label className="mt-1.5 flex flex-col gap-1">
			<span className="text-xs font-semibold text-ink-soft">Punto de salida{many ? ` · ${choice.territoryLabel}` : ""}</span>
			<select
				value={value}
				disabled={busy}
				onChange={(e) => change(e.target.value)}
				className="min-h-11 w-full max-w-md rounded-2xl border border-border bg-surface px-3 text-base text-ink disabled:opacity-60 sm:text-sm"
			>
				{choice.options.map((d) => (
					<option key={d.fid} value={d.fid} title={departureText(d)}>
						{d.name}
					</option>
				))}
			</select>
			{error && <span className="text-xs text-red-600">{error}</span>}
		</label>
	);
}

/** El texto de la tarjeta. La predicación (también el territorio del capitán) abre el Calendario en el día de la salida. */
function TextBlock({ openDate, children }: { openDate?: string; children: React.ReactNode }) {
	if (!openDate) return <div className="min-w-0 flex-1 py-0.5">{children}</div>;
	return (
		<Link href={`/calendar?date=${openDate}`} className="-my-1 min-w-0 flex-1 rounded-xl py-1.5 hover:bg-surface-alt" title="Ver la predicación de ese día">
			{children}
		</Link>
	);
}
