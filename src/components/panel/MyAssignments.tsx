"use client";

import { useState } from "react";
import { Check, Map as MapIcon, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { TerritoryMapViewer } from "@/components/territories/TerritoryMapViewer";
import { formatShortDate } from "@/lib/dateFormat";
import type { PanelAssignment } from "@/lib/queries/panel";

const MEETING_TYPE_LABEL: Record<string, string> = {
	midweek: "Entre semana",
	weekend: "Fin de semana",
	operational: "Tarea operativa",
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
}: {
	title: string;
	items: PanelAssignment[];
	emptyLabel: string;
	/** Se llama cuando una acción cambia las asignaciones (p. ej. completar un territorio). */
	onChange?: () => void;
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
								<div className="min-w-0 flex-1 py-0.5">
									{pending ? (
										<p className="text-xs font-semibold text-warn">Pendiente</p>
									) : (
										<p className="text-xs font-semibold text-ink-soft">
											{dates} · {MEETING_TYPE_LABEL[item.meetingType]}
										</p>
									)}
									<p className="mt-0.5 text-base font-semibold text-ink">{item.label}</p>
									{pending && <p className="mt-0.5 text-[13px] text-ink-soft">Asignado el {dates}</p>}
									{territory && !pending && territory.comment && (
										<p className="mt-0.5 text-[13px] text-ink-soft">«{territory.comment}»</p>
									)}
								</div>
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
