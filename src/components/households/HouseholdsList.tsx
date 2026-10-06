"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar, Fab, IconButton, List, ListRow, PageHeader, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { ExportButton } from "@/components/export/ExportButton";

interface Household {
	id: string;
	label: string;
	members: { id: string; fullName: string }[];
}

const MAX_STACK = 3;

// Avatares encimados de los integrantes (hasta 3, y "+N" con el resto).
function MemberStack({ members }: { members: Household["members"] }) {
	if (members.length === 0) return null;
	const extra = members.length - MAX_STACK;
	const shown = extra > 0 ? members.slice(0, MAX_STACK - 1) : members;
	const hidden = members.length - shown.length;
	return (
		<div className="flex shrink-0 items-center" aria-hidden="true">
			{shown.map((m) => (
				<span key={m.id} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
					<Avatar name={m.fullName} size={30} />
				</span>
			))}
			{extra > 0 && (
				<span className="-ml-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent ring-2 ring-surface">
					+{hidden}
				</span>
			)}
		</div>
	);
}

export function HouseholdsList() {
	const [households, setHouseholds] = useState<Household[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<Household | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [label, setLabel] = useState("");
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		const response = await fetch("/api/households");
		if (response.ok) setHouseholds(((await response.json()) as { items: Household[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return households;
		return households.filter(
			(h) => h.label.toLowerCase().includes(term) || h.members.some((m) => m.fullName.toLowerCase().includes(term)),
		);
	}, [households, search]);

	function openCreate() {
		setEditing(null);
		setLabel("");
		setModalOpen(true);
	}

	function openEdit(household: Household) {
		setEditing(household);
		setLabel(household.label);
		setModalOpen(true);
	}

	async function handleSave() {
		setSaving(true);
		if (editing) {
			await fetch(`/api/households/${editing.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label }),
			});
		} else {
			await fetch("/api/households", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label }),
			});
		}
		setSaving(false);
		setModalOpen(false);
		load();
	}

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Hogares"
				actions={<ExportButton kind="households" formats={["png", "docx"]} label="Descargar reporte" title="Reporte de hogares" />}
			/>

			<div className="flex h-12 items-center gap-3 rounded-full bg-surface px-4 text-ink-soft focus-within:ring-1 focus-within:ring-accent">
				<Search size={20} className="shrink-0" />
				<input
					type="search"
					aria-label="Buscar hogar o persona"
					placeholder="Buscar hogar o persona"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-full min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft focus:outline-none sm:text-sm"
				/>
			</div>

			{!loading && filtered.length === 0 ? (
				<List>
					<div className="px-4 py-4 text-sm text-ink-soft">
						{households.length === 0 ? "Todavía no hay hogares registrados." : "No hay hogares que coincidan."}
					</div>
				</List>
			) : (
				<List>
					{filtered.map((h) => {
						const expanded = expandedId === h.id;
						return (
							<div key={h.id}>
								<ListRow
									onClick={() => setExpandedId(expanded ? null : h.id)}
									title={h.label}
									subtitle={`${h.members.length} ${h.members.length === 1 ? "persona" : "personas"}`}
									trailing={<MemberStack members={h.members} />}
								/>
								{expanded && (
									<div className="flex items-start justify-between gap-3 px-4 pb-4">
										<div className="min-w-0 flex-1">
											{h.members.length === 0 ? (
												<p className="text-sm text-ink-soft">Sin miembros asignados.</p>
											) : (
												<>
													<SectionLabel>Integrantes</SectionLabel>
													<ul className="flex flex-col gap-1.5 px-1 text-sm text-ink">
														{h.members.map((m) => (
															<li key={m.id}>{m.fullName}</li>
														))}
													</ul>
												</>
											)}
										</div>
										<IconButton label="Editar hogar" icon={Pencil} tone="accent" onClick={() => openEdit(h)} />
									</div>
								)}
							</div>
						);
					})}
				</List>
			)}

			<p className="text-[13px] leading-relaxed text-ink-soft">
				Agrupa a los miembros de una misma familia — se usa para la regla de ayudante del mismo sexo o
				familiar (S-38 párr. 7, 8, 10). La familia de cada publicador se asigna desde su ficha.
			</p>

			<Fab label="Nuevo" icon={Plus} onClick={openCreate} />

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar hogar" : "Nuevo hogar"}>
				<div className="flex flex-col gap-3">
					<Input
						label="Nombre del hogar"
						placeholder='p. ej. "Familia Pérez"'
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						required
					/>
					<Button onClick={handleSave} disabled={saving || !label} className="mt-2">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
