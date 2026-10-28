"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectBox } from "@/components/ui/Input";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { PageLoader } from "@/components/ui/Spinner";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

type MeetingType = "midweek" | "weekend";
interface Slot {
	privilegeId: string;
	position: string | null;
}
interface Loaded {
	midweek: Slot[];
	weekend: Slot[];
	catalog: { id: string; name: string }[];
}

const TITLES: Record<MeetingType, string> = { midweek: "Entre semana", weekend: "Fin de semana" };

/** Pestaña «Puestos»: qué puestos de tareas operativas lleva cada reunión. Al guardar se ajustan las reuniones desde esta semana
 * (y el job diario lo repite cada día): se agregan los puestos que falten y se quitan los que sobren, solo si nadie los ocupa. */
export function OperationalTemplate() {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/operational/template")
			.then((r) => (r.ok ? r.json() : Promise.reject()))
			.then((body: unknown) => setData(body as Loaded))
			.catch(() => setError("No se pudieron cargar los puestos."));
	}, []);

	if (error) return <p className="text-sm text-red-600">{error}</p>;
	if (!data) return <PageLoader />;

	return (
		<div className="flex flex-col gap-6">
			<p className="text-sm text-ink-soft">
				Define los puestos que lleva cada reunión. Una tarea puede ir varias veces (por ejemplo, dos acomodadores de entrada); el
				nombre del puesto es opcional y sirve para distinguirlos. Al guardar se ajustan las reuniones desde esta semana, y el job
				diario lo repite cada día: agrega los puestos que falten y quita los que sobren, pero nunca uno que ya tiene a alguien
				asignado.
			</p>
			{(["midweek", "weekend"] as const).map((type) => (
				<TemplateEditor
					key={type}
					type={type}
					initial={data[type]}
					catalog={data.catalog}
					copyFrom={type === "weekend" ? { label: "Copiar de entre semana", slots: data.midweek } : undefined}
					onSaved={(slots) => setData((d) => (d ? { ...d, [type]: slots } : d))}
				/>
			))}
		</div>
	);
}

function TemplateEditor({
	type,
	initial,
	catalog,
	copyFrom,
	onSaved,
}: {
	type: MeetingType;
	initial: Slot[];
	catalog: Loaded["catalog"];
	copyFrom?: { label: string; slots: Slot[] };
	onSaved: (slots: Slot[]) => void;
}) {
	const [slots, setSlots] = useState<Slot[]>(initial);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
	useUnsavedChanges(dirty);

	function edit(next: Slot[]) {
		setSlots(next);
		setDirty(true);
		setMessage(null);
	}
	const update = (i: number, patch: Partial<Slot>) => edit(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

	async function save() {
		setSaving(true);
		setMessage(null);
		const res = await fetch("/api/operational/template", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingType: type, slots }),
		});
		setSaving(false);
		const body = (await res.json().catch(() => null)) as
			| { applied?: { meetings: number; added: number; removed: number }; message?: string }
			| null;
		if (!res.ok) {
			setMessage({ ok: false, text: body?.message ?? "No se pudo guardar." });
			return;
		}
		setDirty(false);
		onSaved(slots);
		const a = body?.applied;
		setMessage({
			ok: true,
			text:
				a && a.meetings > 0
					? `Guardado. Se ajustaron ${a.meetings} ${a.meetings === 1 ? "reunión" : "reuniones"}: ${a.added} ${a.added === 1 ? "puesto agregado" : "puestos agregados"} y ${a.removed} ${a.removed === 1 ? "quitado" : "quitados"}.`
					: "Guardado.",
		});
	}

	const names = new Map(catalog.map((c) => [c.id, c.name]));
	return (
		<section className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<SectionLabel>{`${TITLES[type]} · ${slots.length} ${slots.length === 1 ? "puesto" : "puestos"}`}</SectionLabel>
				<div className="ml-auto flex items-center gap-2">
					{copyFrom && (
						<IconButton label={copyFrom.label} icon={Copy} onClick={() => edit(copyFrom.slots.map((s) => ({ ...s })))} />
					)}
					<Button className="!min-h-10" onClick={save} disabled={!dirty || saving}>
						<Save size={16} />
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>
			{message && <p className={`text-sm ${message.ok ? "text-ink-soft" : "text-red-600"}`}>{message.text}</p>}
			{slots.length === 0 ? (
				<Card>
					<p className="text-sm text-ink-soft">Sin puestos: las reuniones de {TITLES[type].toLowerCase()} no llevarán tareas operativas.</p>
				</Card>
			) : (
					<List>
						{slots.map((slot, i) => (
							<div key={i} className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center">
								<SelectBox
									aria-label="Tarea"
									value={slot.privilegeId}
									onChange={(e) => update(i, { privilegeId: e.target.value })}
									className="min-h-11 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-ink sm:flex-1"
								>
									{!names.has(slot.privilegeId) && <option value={slot.privilegeId}>(tarea que ya no existe)</option>}
									{catalog.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
								</SelectBox>
								<div className="flex items-center gap-2 sm:w-64">
									<input
										value={slot.position ?? ""}
										onChange={(e) => update(i, { position: e.target.value || null })}
										placeholder="Puesto (opcional)"
										aria-label="Nombre del puesto"
										maxLength={60}
										className="min-h-11 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
									/>
									<IconButton label="Quitar puesto" icon={Trash2} tone="danger" onClick={() => edit(slots.filter((_, j) => j !== i))} />
								</div>
							</div>
						))}
					</List>
			)}
			<div>
				<Button
					variant="secondary"
					className="!min-h-10"
					disabled={catalog.length === 0}
					onClick={() => edit([...slots, { privilegeId: slots[slots.length - 1]?.privilegeId ?? catalog[0].id, position: null }])}
				>
					<Plus size={16} />
					Agregar puesto
				</Button>
			</div>
		</section>
	);
}
