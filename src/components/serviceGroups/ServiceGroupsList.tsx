"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Fab, IconButton, List, ListRow, PageHeader, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { ExportButton } from "@/components/export/ExportButton";

// Paleta curada en vez de un <input type="color"> libre — mismo lenguaje
// visual que los acentos de tema de la app (ver ThemeProvider.ACCENTS).
const GROUP_COLOR_PALETTE = [
	"#3f6b52",
	"#3d5aa3",
	"#b5563c",
	"#1f6f78",
	"#9c7a24",
	"#7c3aed",
	"#be185d",
	"#0891b2",
	"#ca8a04",
	"#dc2626",
] as const;

interface Group {
	id: string;
	name: string;
	active: boolean;
	overseerUserId: string | null;
	overseerName: string | null;
	assistantUserId: string | null;
	assistantName: string | null;
	regularMeetingPlace: string | null;
	color: string | null;
	memberCount: number;
	members: { id: string; fullName: string }[];
}

interface PublisherOption {
	id: string;
	fullName: string;
	isOverseer: boolean;
	isAssistant: boolean;
}

export function ServiceGroupsList() {
	const [groups, setGroups] = useState<Group[]>([]);
	const [publishers, setPublishers] = useState<PublisherOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [editingGroup, setEditingGroup] = useState<Group | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [overseerUserId, setOverseerUserId] = useState("");
	const [assistantUserId, setAssistantUserId] = useState("");
	const [regularMeetingPlace, setRegularMeetingPlace] = useState("");
	const [color, setColor] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		const [groupsRes, publishersRes] = await Promise.all([
			fetch("/api/field-service-groups"),
			fetch("/api/field-service-groups/publisher-options"),
		]);
		if (groupsRes.ok) setGroups(((await groupsRes.json()) as { items: Group[] }).items);
		if (publishersRes.ok) setPublishers(((await publishersRes.json()) as { items: PublisherOption[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	function openCreate() {
		setEditingGroup(null);
		setName("");
		setOverseerUserId("");
		setAssistantUserId("");
		setRegularMeetingPlace("");
		setColor(null);
		setModalOpen(true);
	}

	function openEdit(group: Group) {
		setEditingGroup(group);
		setName(group.name);
		setOverseerUserId(group.overseerUserId ?? "");
		setAssistantUserId(group.assistantUserId ?? "");
		setRegularMeetingPlace(group.regularMeetingPlace ?? "");
		setColor(group.color);
		setModalOpen(true);
	}

	async function handleSubmit() {
		setSaving(true);
		const body = {
			name,
			overseerUserId: overseerUserId || null,
			assistantUserId: assistantUserId || null,
			regularMeetingPlace: regularMeetingPlace || null,
			color,
		};
		if (editingGroup) {
			await fetch(`/api/field-service-groups/${editingGroup.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		} else {
			await fetch("/api/field-service-groups", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		}
		setSaving(false);
		setModalOpen(false);
		load();
	}

	// Solo quienes tienen el nombramiento correspondiente; se conserva a quien
	// ya está asignado aunque lo haya perdido, para que el combo no quede vacío.
	const overseerOptions = publishers.filter((p) => p.isOverseer || p.id === overseerUserId);
	const assistantOptions = publishers.filter((p) => p.isAssistant || p.id === assistantUserId);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Grupos de servicio"
				actions={<ExportButton kind="groups" formats={["png", "docx"]} label="Descargar reporte" title="Reporte de grupos de servicio" />}
			/>

			{!loading && groups.length === 0 ? (
				<List>
					<div className="px-4 py-4 text-sm text-ink-soft">Todavía no hay grupos de servicio.</div>
				</List>
			) : (
				<List>
					{groups.map((group) => {
						const expanded = expandedId === group.id;
						return (
							<div key={group.id}>
								<ListRow
									onClick={() => setExpandedId(expanded ? null : group.id)}
									leading={
										<span
											className="h-3.5 w-3.5 shrink-0 rounded-full bg-border"
											style={group.color ? { backgroundColor: group.color } : undefined}
										/>
									}
									title={group.name}
									subtitle={`${group.overseerName ?? "sin superintendente"} · ${
										group.assistantName ? `auxiliar ${group.assistantName}` : "sin auxiliar"
									}`}
									trailing={<span className="font-display text-[22px] font-semibold text-ink">{group.memberCount}</span>}
								/>
								{expanded && (
									<div className="flex flex-col gap-3 px-4 pb-4">
										<div className="flex items-start justify-between gap-3">
											<div className="flex min-w-0 flex-col items-start gap-1.5 text-sm text-ink-soft">
												<span>Lugar de reunión: {group.regularMeetingPlace ?? "—"}</span>
												<Badge tone={group.active ? "success" : "neutral"}>{group.active ? "Activo" : "Inactivo"}</Badge>
											</div>
											<IconButton label="Editar grupo" icon={Pencil} tone="accent" onClick={() => openEdit(group)} />
										</div>
										{group.members.length === 0 ? (
											<p className="text-sm text-ink-soft">Sin integrantes.</p>
										) : (
											<div>
												<SectionLabel>Integrantes</SectionLabel>
												<ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto px-1 text-sm text-ink">
													{group.members.map((m) => (
														<li key={m.id}>{m.fullName}</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</List>
			)}

			<p className="text-[13px] leading-relaxed text-ink-soft">
				El número es la cantidad de integrantes. Toca un grupo para ver a su gente.
			</p>

			<Fab label="Nuevo" icon={Plus} onClick={openCreate} />

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingGroup ? "Editar grupo" : "Nuevo grupo"}>
				<div className="flex flex-col gap-3">
					<Input label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} required />
					<Select label="Superintendente" value={overseerUserId} onChange={(e) => setOverseerUserId(e.target.value)}>
						<option value="">Sin asignar</option>
						{overseerOptions.map((p) => (
							<option key={p.id} value={p.id}>
								{p.fullName}
							</option>
						))}
					</Select>
					<Select label="Auxiliar" value={assistantUserId} onChange={(e) => setAssistantUserId(e.target.value)}>
						<option value="">Sin asignar</option>
						{assistantOptions.map((p) => (
							<option key={p.id} value={p.id}>
								{p.fullName}
							</option>
						))}
					</Select>
					<Input
						label="Lugar de reunión habitual (dirección o enlace de Zoom, sfg 3:3)"
						value={regularMeetingPlace}
						onChange={(e) => setRegularMeetingPlace(e.target.value)}
					/>
					<div className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-ink">Color del grupo</span>
						<div className="flex flex-wrap items-center gap-2">
							<Tooltip content="Sin color">
								<button
									type="button"
									onClick={() => setColor(null)}
									aria-label="Sin color"
									className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs text-ink-soft ${
										color === null ? "border-accent" : "border-border"
									}`}
								>
									—
								</button>
							</Tooltip>
							{GROUP_COLOR_PALETTE.map((c) => (
								<Tooltip key={c} content={c}>
									<button
										type="button"
										onClick={() => setColor(c)}
										aria-label={`Color ${c}`}
										className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
											color === c ? "border-accent" : "border-transparent"
										}`}
										style={{ backgroundColor: c }}
									>
										{color === c && <Check size={16} className="text-white" />}
									</button>
								</Tooltip>
							))}
						</div>
					</div>
					<Button onClick={handleSubmit} disabled={saving || !name} className="mt-2">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
