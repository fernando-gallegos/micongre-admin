"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { formatShortDate } from "@/lib/dateFormat";

interface VisitRequest {
	id: string;
	requestedDate: string;
	notes: string | null;
	assignedElders: string[] | null;
}

export function RequestPastoralVisit({
	onChange,
	formOpen,
	onFormOpenChange,
}: {
	onChange?: () => void;
	formOpen: boolean;
	onFormOpenChange: (open: boolean) => void;
}) {
	const [items, setItems] = useState<VisitRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [date, setDate] = useState("");
	const [notes, setNotes] = useState("");
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		const response = await fetch("/api/pastoral/visit-requests/mine");
		if (response.ok) setItems(((await response.json()) as { items: VisitRequest[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	async function submit() {
		setSaving(true);
		await fetch("/api/pastoral/visit-requests/mine", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ requestedDate: date, notes: notes || null }),
		});
		setSaving(false);
		onFormOpenChange(false);
		setDate("");
		setNotes("");
		load();
		onChange?.();
	}

	async function cancel(id: string) {
		await fetch(`/api/pastoral/visit-requests/${id}`, { method: "DELETE" });
		load();
		onChange?.();
	}

	return (
		<>
			{/* Sin solicitudes no hay nada que mostrar: el formulario se abre desde «Solicitar visita». */}
			{!loading && items.length > 0 && (
				<section>
					<SectionLabel>Visitas de pastoreo</SectionLabel>
					<List>
						{items.map((item) => (
							<div key={item.id} className="flex items-center gap-1 py-3 pl-4 pr-2">
								<div className="min-w-0 flex-1 py-0.5">
									<p className="text-base font-semibold text-ink">{formatShortDate(item.requestedDate)}</p>
									<p className="mt-0.5 text-[13px] text-ink-soft">
										{item.assignedElders ? `Asignado a ${item.assignedElders.join(" y ")}` : "Pendiente de asignar"}
									</p>
								</div>
								<IconButton label="Cancelar solicitud" icon={X} tone="danger" onClick={() => cancel(item.id)} />
							</div>
						))}
					</List>
				</section>
			)}

			<Modal open={formOpen} onClose={() => onFormOpenChange(false)} title="Solicitar visita de pastoreo">
				<div className="flex flex-col gap-4">
					<Input label="Fecha deseada" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
					<Input label="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => onFormOpenChange(false)}>
							Cancelar
						</Button>
						<Button onClick={submit} disabled={!date || saving}>
							{saving ? "Enviando..." : "Enviar solicitud"}
						</Button>
					</div>
				</div>
			</Modal>
		</>
	);
}
