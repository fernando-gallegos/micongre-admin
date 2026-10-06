"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Send, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, ChipGroup, Fab, IconButton, List } from "@/components/ui/Layout";
import { Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ExportButton } from "@/components/export/ExportButton";
import { formatShortDate } from "@/lib/dateFormat";
import { TERRITORY_KIND_LABEL, type TerritoryKind } from "@/lib/territories/geo";
import { useAssignableUsers } from "./useAssignableUsers";
import { PageLoader } from "@/components/ui/Spinner";

type Status = "assigned" | "completed" | "returned";

interface AssignmentRow {
	id: string;
	territoryId: string;
	territoryNumber: string;
	territoryName: string | null;
	territoryKind: TerritoryKind;
	assigneeName: string;
	assignedAt: string;
	status: Status;
	resolvedAt: string | null;
	resolutionComment: string | null;
	notifiedAt: string | null;
}

type StatusFilter = "all" | Status;

const STATUS_TEXT = {
	assigned: { label: "Vigente", className: "text-warn" },
	completed: { label: "Completado", className: "text-accent" },
	returned: { label: "Devuelto", className: "text-ink-soft" },
} as const;

const FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "Todas" },
	{ value: "assigned", label: "Vigentes" },
	{ value: "completed", label: "Completadas" },
	{ value: "returned", label: "Devueltas" },
];

const RESOLVE_TEXT = {
	completed: { title: "Completar territorio", confirm: "Completar" },
	returned: { title: "Devolver territorio", confirm: "Devolver" },
} as const;

/** Listado de todas las asignaciones de territorios, con las acciones de quien
 * administra: avisar, completar, devolver, cancelar o eliminar. */
export function AssignmentsTab() {
	const [rows, setRows] = useState<AssignmentRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [busyId, setBusyId] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [resolving, setResolving] = useState<{ row: AssignmentRow; status: "completed" | "returned" } | null>(null);
	const [comment, setComment] = useState("");
	const [assignOpen, setAssignOpen] = useState(false);

	const load = useCallback(async () => {
		const response = await fetch("/api/territories/assignments");
		if (response.ok) setRows(((await response.json()) as { items: AssignmentRow[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const visible = useMemo(() => rows.filter((r) => filter === "all" || r.status === filter), [rows, filter]);

	async function run(row: AssignmentRow, request: () => Promise<Response>, okMessage?: string): Promise<boolean> {
		setBusyId(row.id);
		setMessage(null);
		const response = await request();
		setBusyId(null);
		if (!response.ok) {
			setMessage("No se pudo completar la acción.");
			return false;
		}
		if (okMessage) setMessage(okMessage);
		await load();
		return true;
	}

	function notify(row: AssignmentRow) {
		return run(row, () => fetch(`/api/territories/${row.territoryId}/notify`, { method: "POST" }), `Aviso enviado a ${row.assigneeName}.`);
	}

	function cancel(row: AssignmentRow) {
		if (!window.confirm(`¿Cancelar la asignación del territorio ${row.territoryNumber} a ${row.assigneeName}? No queda registro.`)) return;
		return run(row, () => fetch(`/api/territories/assignments/${row.id}`, { method: "DELETE" }));
	}

	function remove(row: AssignmentRow) {
		if (!window.confirm(`¿Eliminar este registro del territorio ${row.territoryNumber}?`)) return;
		return run(row, () => fetch(`/api/territories/assignments/${row.id}`, { method: "DELETE" }));
	}

	async function confirmResolve() {
		if (!resolving) return;
		const ok = await run(resolving.row, () =>
			fetch(`/api/territories/assignments/${resolving.row.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: resolving.status, comment: comment.trim() || null }),
			}),
		);
		if (ok) setResolving(null);
	}

	function startResolve(row: AssignmentRow, status: "completed" | "returned") {
		setResolving({ row, status });
		setComment("");
	}

	return (
		<div className="flex flex-col gap-4">
			<ChipGroup>
				{FILTERS.map((f) => (
					<Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
						{f.label}
					</Chip>
				))}
			</ChipGroup>

			{message && <p className="px-1 text-sm text-ink-soft">{message}</p>}

			{loading ? (
				<PageLoader />
			) : visible.length === 0 ? (
				<Card>
					<p className="text-sm text-ink-soft">
						{rows.length === 0
							? "Todavía no hay asignaciones. Asigna un territorio con el botón «Asignar»."
							: "Ninguna asignación coincide con el filtro."}
					</p>
				</Card>
			) : (
				<List>
					{visible.map((r) => {
						const busy = busyId === r.id;
						const status = STATUS_TEXT[r.status];
						return (
							<div key={r.id} className="py-3 pl-4 pr-1">
								<div className="flex items-baseline gap-2.5 pr-3">
									<span className="min-w-10 shrink-0 font-display text-2xl font-semibold text-ink">{r.territoryNumber}</span>
									<span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
										{r.territoryName ?? TERRITORY_KIND_LABEL[r.territoryKind]}
									</span>
									<span className={`shrink-0 text-xs font-semibold ${status.className}`}>{status.label}</span>
								</div>
								<div className="mt-0.5 pr-3 text-[13px] text-ink-soft">
									{r.territoryName ? `${TERRITORY_KIND_LABEL[r.territoryKind]} · ` : ""}
									{r.assigneeName} ·{" "}
									{r.status === "assigned"
										? `desde el ${formatShortDate(r.assignedAt)} · ${r.notifiedAt ? `avisado ${formatShortDate(r.notifiedAt)}` : "sin avisar"}`
										: `${formatShortDate(r.assignedAt)}${r.resolvedAt ? ` → ${formatShortDate(r.resolvedAt)}` : ""}`}
								</div>
								{r.resolutionComment && <div className="mt-1.5 pr-3 text-[13px] text-ink">«{r.resolutionComment}»</div>}
								<div className="mt-1 flex justify-end">
									<ExportButton
										kind="territory-assignment"
										params={{ assignmentId: r.id }}
										formats={["png", "docx"]}
										label="Descargar reporte"
										title={`Reporte del territorio ${r.territoryNumber}`}
									/>
									{r.status === "assigned" ? (
										<>
											<IconButton
												label={r.notifiedAt ? "Reenviar aviso" : "Enviar aviso"}
												icon={Send}
												tone={r.notifiedAt ? "plain" : "accent"}
												disabled={busy}
												onClick={() => notify(r)}
											/>
											<IconButton label="Marcar completado" icon={Check} disabled={busy} onClick={() => startResolve(r, "completed")} />
											<IconButton label="Marcar devuelto" icon={Undo2} disabled={busy} onClick={() => startResolve(r, "returned")} />
											<IconButton label="Cancelar asignación" icon={X} disabled={busy} onClick={() => cancel(r)} />
										</>
									) : (
										<IconButton label="Eliminar registro" icon={Trash2} tone="danger" disabled={busy} onClick={() => remove(r)} />
									)}
								</div>
							</div>
						);
					})}
				</List>
			)}

			<Fab label="Asignar" icon={Plus} onClick={() => setAssignOpen(true)} />

			{assignOpen && (
				<AssignModal
					onClose={() => setAssignOpen(false)}
					onAssigned={() => {
						setAssignOpen(false);
						load();
					}}
				/>
			)}

			{resolving && (
				<Modal open onClose={() => setResolving(null)} title={RESOLVE_TEXT[resolving.status].title}>
					<div className="flex flex-col gap-3">
						<p className="text-sm text-ink">
							Territorio <span className="font-semibold">{resolving.row.territoryNumber}</span>, encargado{" "}
							<span className="font-semibold">{resolving.row.assigneeName}</span>.
						</p>
						<label className="flex flex-col gap-1 text-sm">
							<span className="font-medium text-ink">Comentario (opcional)</span>
							<textarea
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								maxLength={500}
								rows={3}
								autoFocus
								className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
							/>
						</label>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setResolving(null)}>
								Cancelar
							</Button>
							<Button onClick={confirmResolve} disabled={busyId === resolving.row.id}>
								{RESOLVE_TEXT[resolving.status].confirm}
							</Button>
						</div>
					</div>
				</Modal>
			)}
		</div>
	);
}

interface TerritoryOption {
	id: string;
	number: string;
	name: string | null;
	kind: TerritoryKind;
	current: { assigneeName: string } | null;
}

/** Asignar un territorio: se elige el territorio y a quién (solo quienes tienen
 * el privilegio asignable que corresponde al tipo del territorio). */
function AssignModal({ onClose, onAssigned }: { onClose: () => void; onAssigned: () => void }) {
	const people = useAssignableUsers();
	const [territories, setTerritories] = useState<TerritoryOption[] | null>(null);
	const [territoryId, setTerritoryId] = useState("");
	const [assigneeId, setAssigneeId] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/territories")
			.then((r) => (r.ok ? (r.json() as Promise<{ items: TerritoryOption[] }>) : { items: [] as TerritoryOption[] }))
			.then((body) => setTerritories(body.items));
	}, []);

	const selected = territories?.find((t) => t.id === territoryId) ?? null;
	const options = selected ? people[selected.kind] : [];

	async function save() {
		if (!selected || !assigneeId) return;
		setSaving(true);
		setError(null);
		const response = await fetch(`/api/territories/${selected.id}/assign`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ assigneeUserId: assigneeId }),
		});
		setSaving(false);
		if (response.ok) return onAssigned();
		setError("No se pudo asignar. Esa persona ya no es asignable para este tipo de territorio.");
	}

	return (
		<Modal open onClose={onClose} title="Asignar territorio">
			<div className="flex flex-col gap-3">
				<Select
					label="Territorio"
					value={territoryId}
					onChange={(e) => {
						setTerritoryId(e.target.value);
						setAssigneeId("");
					}}
				>
					<option value="">{territories ? "Elige un territorio..." : "Cargando..."}</option>
					{(territories ?? []).map((t) => (
						<option key={t.id} value={t.id}>
							{t.number}
							{t.name ? ` — ${t.name}` : ""} · {TERRITORY_KIND_LABEL[t.kind]}
							{t.current ? ` (con ${t.current.assigneeName})` : ""}
						</option>
					))}
				</Select>
				<Select label="Encargado" value={assigneeId} disabled={!selected} onChange={(e) => setAssigneeId(e.target.value)}>
					<option value="">{selected ? "Elige al encargado..." : "Primero elige el territorio"}</option>
					{options.map((p) => (
						<option key={p.id} value={p.id}>
							{p.fullName}
						</option>
					))}
				</Select>
				{selected && options.length === 0 && (
					<p className="text-sm text-ink-soft">
						Nadie tiene el privilegio «{selected.kind === "general" ? "Asignable para territorio" : "Asignable para predicación pública"}». Otórgalo desde la ficha del publicador.
					</p>
				)}
				{selected?.current && (
					<p className="text-sm text-ink-soft">Este territorio ya está con {selected.current.assigneeName}; al guardar se cambia el encargado.</p>
				)}
				{error && <p className="text-sm text-warn">{error}</p>}
				<div className="flex justify-end gap-2">
					<Button variant="secondary" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={save} disabled={saving || !selected || !assigneeId}>
						{saving ? "Guardando..." : "Asignar"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
