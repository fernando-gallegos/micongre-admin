"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserCog } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton, List, ListRow } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { SelectAllControls } from "@/components/shared/SelectAllControls";
import { APPOINTMENT_LABELS } from "@/lib/appointmentLabels";

interface Appointment {
	id: string;
	appointmentType: string;
	startDate: string;
	endDate: string | null;
}

const APPOINTMENT_TYPES = Object.keys(APPOINTMENT_LABELS);

export function AppointmentsCard({
	publisherId,
	appointments,
	compact = false,
	onSaved,
}: {
	publisherId: string;
	appointments: Appointment[];
	// Sin la lista alrededor — solo el ícono disparador + el modal, para
	// usarse como acción de fila (p. ej. en la lista de personas).
	compact?: boolean;
	onSaved?: () => void;
}) {
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);

	const active = appointments.filter((a) => !a.endDate);

	function openModal() {
		setChecked(new Set(active.map((a) => a.appointmentType)));
		setWarnings([]);
		setModalOpen(true);
	}

	function toggle(type: string) {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			return next;
		});
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		const response = await fetch(`/api/publishers/${publisherId}/appointments`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ appointmentTypes: [...checked] }),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar. Intenta de nuevo.");
			return;
		}
		const body = (await response.json()) as { warnings?: string[] };
		router.refresh();
		onSaved?.();
		// Con avisos (p. ej. se le quitó el nombramiento a otra persona porque
		// solo 1 puede tenerlo), se deja el modal abierto para que se lean antes
		// de cerrarlo — sin avisos, se cierra normal.
		if (body.warnings && body.warnings.length > 0) {
			setWarnings(body.warnings);
		} else {
			setModalOpen(false);
		}
	}

	const trigger = <IconButton label="Gestionar nombramientos" icon={UserCog} onClick={openModal} />;

	const modal = (
		<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Gestionar nombramientos">
			<SelectAllControls
				onSelectAll={() => setChecked(new Set(APPOINTMENT_TYPES))}
				onClearAll={() => setChecked(new Set())}
			/>
			<div className="flex max-h-[60vh] flex-col overflow-y-auto">
				{APPOINTMENT_TYPES.map((type) => (
					<label key={type} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm text-ink hover:bg-surface-alt">
						<input type="checkbox" className="h-5 w-5 accent-accent" checked={checked.has(type)} onChange={() => toggle(type)} />
						{APPOINTMENT_LABELS[type]}
					</label>
				))}
			</div>
			{error && <p className="mt-3 text-sm text-red-600">{error}</p>}
			{warnings.length > 0 && (
				<div className="mt-3 flex flex-col gap-1 rounded-2xl bg-warn-soft p-3 text-xs text-warn">
					{warnings.map((w, i) => (
						<p key={i}>{w}</p>
					))}
				</div>
			)}
			<Button
				onClick={warnings.length > 0 ? () => setModalOpen(false) : handleSave}
				disabled={saving}
				className="mt-4 w-full"
			>
				{saving ? "Guardando..." : warnings.length > 0 ? "Entendido" : "Guardar"}
			</Button>
		</Modal>
	);

	if (compact) {
		return (
			<>
				{trigger}
				{modal}
			</>
		);
	}

	return (
		<section>
			<div className="mb-1 flex items-center justify-between pl-1">
				<h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Nombramientos</h2>
				{trigger}
			</div>
			<List>
				{active.length === 0 && <div className="px-4 py-4 text-sm text-ink-soft">Ninguno registrado.</div>}
				{active.map((a) => (
					<ListRow
						key={a.id}
						title={APPOINTMENT_LABELS[a.appointmentType] ?? a.appointmentType}
						trailing={<Badge tone="success">Vigente</Badge>}
					/>
				))}
			</List>
			{modal}
		</section>
	);
}
