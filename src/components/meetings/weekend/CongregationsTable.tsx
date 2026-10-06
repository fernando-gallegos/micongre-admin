"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton, List, ListRow } from "@/components/ui/Layout";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ERRORS, request } from "./ArrangementsPanel";
import { SyncFromHubButton, meetingLabel, type Congregation } from "./CongregationPicker";

const DELETE_ERRORS: Record<string, string> = {
	in_use: "No se puede eliminar: tiene oradores o discursos enviados registrados.",
};

function EditCongregationModal({
	congregation: c,
	onClose,
	onSaved,
}: {
	congregation: Congregation;
	onClose: () => void;
	onSaved: (c: Congregation) => void;
}) {
	const [name, setName] = useState(c.name);
	const [phone, setPhone] = useState(c.phone ?? "");
	const [forkUrl, setForkUrl] = useState(c.forkUrl ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const weekend = meetingLabel(c.weekendMeetingDay, c.weekendMeetingTime);
	const midweek = meetingLabel(c.midweekMeetingDay, c.midweekMeetingTime);

	async function save() {
		setBusy(true);
		setError(null);
		const result = await request(`/api/weekend/congregations/${c.id}`, "PATCH", {
			name: name.trim(),
			phone: phone.trim() || null,
			forkUrl: forkUrl.trim() || null,
		});
		setBusy(false);
		if (!result.ok) {
			setError(result.data.error === "name_taken" ? "Ya existe una congregación con ese nombre." : result.error);
			return;
		}
		onSaved(result.data.congregation as Congregation);
		onClose();
	}

	return (
		<Modal open onClose={onClose} title="Editar congregación">
			<div className="flex flex-col gap-3">
				{c.jwUrl && (
					<div className="flex items-center justify-between gap-2 rounded-2xl border border-border px-4 py-2">
						<p className="text-xs text-ink-soft">
							{weekend ? `Fin de semana: ${weekend}` : "Sin horario de fin de semana"}
							{midweek ? ` · Entre semana: ${midweek}` : ""}
						</p>
						<SyncFromHubButton
							congregationId={c.id}
							onSaved={(updated) => {
								onSaved(updated);
								setName(updated.name);
								setPhone(updated.phone ?? "");
							}}
							onError={setError}
						/>
					</div>
				)}
				<Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
				<Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
				<Input
					label="URL de su Mi Congre (para solicitar arreglos)"
					value={forkUrl}
					onChange={(e) => setForkUrl(e.target.value)}
					placeholder="https://micongregacion.micongre.app"
				/>
				{error && <p className="text-sm text-red-600">{error}</p>}
				<Button onClick={save} disabled={!name.trim() || busy}>
					{busy ? "Guardando..." : "Guardar"}
				</Button>
			</div>
		</Modal>
	);
}

/** Pestaña "Congregaciones": sólo el catálogo de congregaciones, con edición. */
export function CongregationsTable({
	congregations,
	search,
	onSaved,
	onDeleted,
}: {
	congregations: Congregation[];
	search: string;
	onSaved: (c: Congregation) => void;
	onDeleted: (id: string) => void;
}) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const needle = search.trim().toLowerCase();
	const rows = needle ? congregations.filter((c) => c.name.toLowerCase().includes(needle)) : congregations;
	const editing = congregations.find((c) => c.id === editingId) ?? null;

	async function remove(c: Congregation) {
		if (!window.confirm(`¿Eliminar la congregación «${c.name}» y sus arreglos de discursos?`)) return;
		setBusyId(c.id);
		setError(null);
		const result = await request(`/api/weekend/congregations/${c.id}`, "DELETE");
		setBusyId(null);
		if (!result.ok) {
			const code = String(result.data.error ?? "");
			setError(DELETE_ERRORS[code] ?? ERRORS[code] ?? result.error);
			return;
		}
		onDeleted(c.id);
	}

	return (
		<>
			{rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">No hay congregaciones registradas.</p>
				</Card>
			)}
			{rows.length > 0 && (
				<List>
					{rows.map((c) => {
						const details = [
							meetingLabel(c.weekendMeetingDay, c.weekendMeetingTime),
							c.phone,
							c.forkUrl ? c.forkUrl.replace(/^https?:\/\//, "") : null,
						].filter(Boolean);
						return (
							<ListRow
								key={c.id}
								title={c.name}
								subtitle={details.length > 0 ? <span className="break-words">{details.join(" · ")}</span> : undefined}
								trailing={
									<div className="-mr-2 flex shrink-0 items-center">
										<IconButton label="Editar" icon={Pencil} onClick={() => setEditingId(c.id)} />
										<IconButton label="Eliminar" icon={Trash2} tone="danger" disabled={busyId === c.id} onClick={() => remove(c)} />
									</div>
								}
							/>
						);
					})}
				</List>
			)}
			{error && <p className="px-1 text-sm text-red-600">{error}</p>}
			{editing && <EditCongregationModal key={editing.id} congregation={editing} onClose={() => setEditingId(null)} onSaved={onSaved} />}
		</>
	);
}
