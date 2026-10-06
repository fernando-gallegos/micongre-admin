"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup, Fab, List, ListRow, PageHeader } from "@/components/ui/Layout";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";
import { formatShortDate } from "@/lib/dateFormat";

interface Assessment {
	id: string;
	groupId: string;
	reportDate: string;
	totalPublishersContacted: number;
	injuredCount: number;
	missingCount: number;
	displacedCount: number;
	deceasedCount: number;
	housesDamagedCount: number;
	housesDestroyedCount: number;
	utilitiesDisrupted: boolean;
	urgentNeedsFoodWater: boolean;
	urgentNeedsShelterClothing: boolean;
	notes: string | null;
	reportedToCobe: boolean;
	reportedToCircuitOverseer: boolean;
}

interface GroupOption {
	id: string;
	name: string;
	color: string | null;
}

type StatusKey = "help" | "safe" | "none";
interface Row {
	key: string;
	groupId: string;
	status: StatusKey;
	assessment: Assessment | null;
}

const STATUS_STYLE: Record<StatusKey, { label: string; dot: string; text: string }> = {
	help: { label: "Ayuda", dot: "bg-warn", text: "text-warn" },
	safe: { label: "A salvo", dot: "bg-accent", text: "text-accent" },
	none: { label: "Sin respuesta", dot: "bg-ink-soft/40", text: "text-ink-soft" },
};

function needsHelp(a: Assessment) {
	return (
		a.urgentNeedsFoodWater ||
		a.urgentNeedsShelterClothing ||
		a.injuredCount > 0 ||
		a.missingCount > 0 ||
		a.displacedCount > 0
	);
}

const EMPTY_FORM = {
	groupId: "",
	reportDate: new Date().toISOString().slice(0, 10),
	totalPublishersContacted: 0,
	injuredCount: 0,
	missingCount: 0,
	displacedCount: 0,
	deceasedCount: 0,
	housesDamagedCount: 0,
	housesDestroyedCount: 0,
	utilitiesDisrupted: false,
	urgentNeedsFoodWater: false,
	urgentNeedsShelterClothing: false,
	notes: "",
	reportedToCobe: false,
	reportedToCircuitOverseer: false,
};

export function DisasterAssessmentsList() {
	const [items, setItems] = useState<Assessment[]>([]);
	const [groups, setGroups] = useState<GroupOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [filter, setFilter] = useState<"all" | StatusKey>("all");

	const load = useCallback(async () => {
		setLoading(true);
		const [assessmentsRes, groupsRes] = await Promise.all([
			fetch("/api/disaster-assessments"),
			fetch("/api/field-service-groups"),
		]);
		if (assessmentsRes.ok) setItems(((await assessmentsRes.json()) as { items: Assessment[] }).items);
		if (groupsRes.ok) setGroups(((await groupsRes.json()) as { items: GroupOption[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	function set<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	function openCreate() {
		setForm(EMPTY_FORM);
		setModalOpen(true);
	}

	async function handleSave() {
		setSaving(true);
		await fetch("/api/disaster-assessments", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(form),
		});
		setSaving(false);
		setModalOpen(false);
		load();
	}

	const groupFor = (groupId: string) => groups.find((g) => g.id === groupId) ?? null;

	// Estado a la vista: necesita ayuda / a salvo / sin respuesta (grupos sin evaluación).
	const rows: Row[] = [
		...items.map((a): Row => ({
			key: a.id,
			groupId: a.groupId,
			status: needsHelp(a) ? "help" : "safe",
			assessment: a,
		})),
		...groups
			.filter((g) => !items.some((a) => a.groupId === g.id))
			.map((g): Row => ({ key: `g-${g.id}`, groupId: g.id, status: "none", assessment: null })),
	];
	const visible = rows.filter((r) => filter === "all" || r.status === filter);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Contingencia" subtitle="Evaluaciones de daños y necesidades por grupo de servicio (sfg 11:5-7)." />

			<ChipGroup>
				<Chip active={filter === "all"} onClick={() => setFilter("all")}>Todos</Chip>
				<Chip active={filter === "help"} onClick={() => setFilter("help")}>Necesitan ayuda</Chip>
				<Chip active={filter === "safe"} onClick={() => setFilter("safe")}>A salvo</Chip>
				<Chip active={filter === "none"} onClick={() => setFilter("none")}>Sin respuesta</Chip>
			</ChipGroup>

			{!loading && items.length === 0 && (
				<p className="px-1 text-sm text-ink-soft">Todavía no hay evaluaciones registradas.</p>
			)}

			{visible.length > 0 && (
				<List>
					{visible.map((r) => {
						const a = r.assessment;
						const group = groupFor(r.groupId);
						const st = STATUS_STYLE[r.status];
						return (
							<ListRow
								key={r.key}
								leading={<span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />}
								title={
									<span className="flex flex-wrap items-center gap-2">
										<GroupBadge name={group?.name ?? "—"} color={group?.color} />
										{a && <span className="text-xs font-normal text-ink-soft">{formatShortDate(a.reportDate)}</span>}
									</span>
								}
								subtitle={
									a ? (
										<>
											<span className="block">
												Contactados {a.totalPublishersContacted} · Heridos {a.injuredCount} · Desaparecidos {a.missingCount} ·
												Desplazados {a.displacedCount} · Fallecidos {a.deceasedCount}
											</span>
											<span className="block">
												Casas dañadas {a.housesDamagedCount} · Destruidas {a.housesDestroyedCount}
											</span>
											{a.notes && <span className="block">{a.notes}</span>}
										</>
									) : (
										"Aún sin reportar"
									)
								}
								trailing={<span className={`text-xs font-semibold ${st.text}`}>{st.label}</span>}
							/>
						);
					})}
				</List>
			)}

			<Fab label="Nueva evaluación" icon={Plus} onClick={openCreate} />

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva evaluación">
				<div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
					<Select label="Grupo de servicio" value={form.groupId} onChange={(e) => set("groupId", e.target.value)} required>
						<option value="">Selecciona un grupo</option>
						{groups.map((g) => (
							<option key={g.id} value={g.id}>
								{g.name}
							</option>
						))}
					</Select>
					<Input label="Fecha" type="date" value={form.reportDate} onChange={(e) => set("reportDate", e.target.value)} />
					<Input
						label="Publicadores contactados"
						type="number"
						value={form.totalPublishersContacted}
						onChange={(e) => set("totalPublishersContacted", Number(e.target.value))}
					/>
					<div className="grid grid-cols-2 gap-3">
						<Input label="Heridos" type="number" value={form.injuredCount} onChange={(e) => set("injuredCount", Number(e.target.value))} />
						<Input label="Desaparecidos" type="number" value={form.missingCount} onChange={(e) => set("missingCount", Number(e.target.value))} />
						<Input label="Desplazados" type="number" value={form.displacedCount} onChange={(e) => set("displacedCount", Number(e.target.value))} />
						<Input label="Fallecidos" type="number" value={form.deceasedCount} onChange={(e) => set("deceasedCount", Number(e.target.value))} />
						<Input
							label="Casas dañadas"
							type="number"
							value={form.housesDamagedCount}
							onChange={(e) => set("housesDamagedCount", Number(e.target.value))}
						/>
						<Input
							label="Casas destruidas"
							type="number"
							value={form.housesDestroyedCount}
							onChange={(e) => set("housesDestroyedCount", Number(e.target.value))}
						/>
					</div>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={form.utilitiesDisrupted} onChange={(e) => set("utilitiesDisrupted", e.target.checked)} />
						Servicios básicos interrumpidos
					</label>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={form.urgentNeedsFoodWater}
							onChange={(e) => set("urgentNeedsFoodWater", e.target.checked)}
						/>
						Necesidad urgente de agua/alimentos
					</label>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={form.urgentNeedsShelterClothing}
							onChange={(e) => set("urgentNeedsShelterClothing", e.target.checked)}
						/>
						Necesidad urgente de albergue/ropa
					</label>
					<Input label="Notas" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={form.reportedToCobe} onChange={(e) => set("reportedToCobe", e.target.checked)} />
						Reportado al Coordinador
					</label>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={form.reportedToCircuitOverseer}
							onChange={(e) => set("reportedToCircuitOverseer", e.target.checked)}
						/>
						Reportado al superintendente de circuito
					</label>
					<Button onClick={handleSave} disabled={saving || !form.groupId} className="mt-2">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
