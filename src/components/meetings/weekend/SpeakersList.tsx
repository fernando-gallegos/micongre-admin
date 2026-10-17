"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Phone, Plus } from "lucide-react";
import { Card, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Chip, ChipGroup, IconButton, List } from "@/components/ui/Layout";
import { AddArrangementModal, ArrangementsPanel } from "./ArrangementsPanel";
import { CongregationsTable } from "./CongregationsTable";
import { DirectoryModal } from "./DirectoryModal";
import { CongregationPicker, HubAddRow, upsertCongregation, type Congregation } from "./CongregationPicker";
import { PageLoader } from "@/components/ui/Spinner";

interface Speaker {
	id: string;
	kind: "local" | "visiting";
	userId: string | null;
	fullName: string;
	phone: string | null;
	congregationId: string | null;
	congregationName: string | null;
	active: boolean;
	outlineIds: string[];
	/** Canción que usa con cada bosquejo: id del bosquejo → número. */
	outlineSongs: Record<string, number>;
}

interface Song {
	number: number;
	title: string;
}

interface Outline {
	id: string;
	number: number;
	category: string;
	title: string;
}

interface PublisherResult {
	id: string;
	fullName: string;
	phone: string | null;
}

function OutlineChecklist({
	outlines,
	selected,
	onToggle,
	songs,
	songByOutline,
	onSong,
}: {
	outlines: Outline[];
	selected: Set<string>;
	onToggle: (id: string) => void;
	songs: Song[];
	songByOutline: Record<string, number | null>;
	onSong: (outlineId: string, song: number | null) => void;
}) {
	if (outlines.length === 0) {
		return <p className="text-xs text-ink-soft">No hay bosquejos en el catálogo todavía — impórtalos en Historial.</p>;
	}

	const sorted = [...outlines].sort((a, b) => a.number - b.number);

	return (
		<div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-2xl border border-border p-3 text-sm">
			{songs.length === 0 && (
				<p className="pb-1 text-xs text-ink-soft">Importa las canciones (EPUB «Cantemos con gozo») en Historial para asignar una a cada discurso.</p>
			)}
			{sorted.map((outline) => (
				<div key={outline.id} className="flex flex-col gap-1 py-0.5">
					<label className="flex items-center gap-2">
						<input type="checkbox" checked={selected.has(outline.id)} onChange={() => onToggle(outline.id)} />
						{outline.number}. {outline.title}
					</label>
					{selected.has(outline.id) && songs.length > 0 && (
						<div className="pl-6">
							<Select
								aria-label={`Canción del discurso ${outline.number}`}
								value={songByOutline[outline.id] != null ? String(songByOutline[outline.id]) : ""}
								onChange={(e) => onSong(outline.id, e.target.value ? Number(e.target.value) : null)}
							>
								<option value="">Sin canción</option>
								{songs.map((s) => (
									<option key={s.number} value={s.number}>
										{s.number}. {s.title}
									</option>
								))}
							</Select>
						</div>
					)}
				</div>
			))}
		</div>
	);
}

export function SpeakersList() {
	const [speakers, setSpeakers] = useState<Speaker[]>([]);
	const [outlines, setOutlines] = useState<Outline[]>([]);
	const [songs, setSongs] = useState<Song[]>([]);
	const [congregations, setCongregations] = useState<Congregation[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [kindFilter, setKindFilter] = useState<"all" | "local" | "visiting" | "congregations" | "arrangements">("all");
	const [modalOpen, setModalOpen] = useState(false);
	const [congregationModalOpen, setCongregationModalOpen] = useState(false);
	const [directoryAvailable, setDirectoryAvailable] = useState(false);
	const [directoryOpen, setDirectoryOpen] = useState(false);
	const [arrangementModalOpen, setArrangementModalOpen] = useState(false);
	const [arrangementsRefresh, setArrangementsRefresh] = useState(0);

	// El directorio de subdominios sólo existe si la app se sirve por el router.
	useEffect(() => {
		fetch("/api/weekend/directory?check=1")
			.then((r) => r.json() as Promise<{ available?: boolean }>)
			.then((body) => setDirectoryAvailable(!!body.available))
			.catch(() => setDirectoryAvailable(false));
	}, []);
	const [editingId, setEditingId] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		const [speakersRes, outlinesRes, congregationsRes, songsRes] = await Promise.all([
			fetch("/api/weekend/speakers"),
			fetch("/api/weekend/outlines"),
			fetch("/api/weekend/congregations"),
			fetch("/api/weekend/songs"),
		]);
		if (songsRes.ok) setSongs(((await songsRes.json()) as { items: Song[] }).items);
		if (speakersRes.ok) setSpeakers(((await speakersRes.json()) as { items: Speaker[] }).items);
		if (outlinesRes.ok) setOutlines(((await outlinesRes.json()) as { items: Outline[] }).items);
		if (congregationsRes.ok) setCongregations(((await congregationsRes.json()) as { items: Congregation[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const filtered = speakers.filter((s) => {
		if ((kindFilter === "local" || kindFilter === "visiting") && s.kind !== kindFilter) return false;
		if (search && !s.fullName.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	});

	const editingSpeaker = editingId ? (speakers.find((s) => s.id === editingId) ?? null) : null;
	const outlineById = new Map(outlines.map((o) => [o.id, o]));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button onClick={() => setModalOpen(true)}>
					<Plus size={18} />
					Nuevo orador
				</Button>
				<Button variant="secondary" onClick={() => setCongregationModalOpen(true)}>
					<Plus size={18} />
					Nueva congregación
				</Button>
				{directoryAvailable && (
					<Button variant="secondary" onClick={() => setDirectoryOpen(true)}>
						<Globe size={18} />
						Congregaciones de Mi Congre
					</Button>
				)}
				{kindFilter === "arrangements" && (
					<Button variant="secondary" onClick={() => setArrangementModalOpen(true)}>
						<Plus size={18} />
						Agregar arreglo
					</Button>
				)}
			</div>

			<div className="sm:max-w-sm">
				<Input placeholder="Buscar por nombre" aria-label="Buscar por nombre" value={search} onChange={(e) => setSearch(e.target.value)} />
			</div>

			<ChipGroup>
				{(["all", "local", "visiting", "congregations", "arrangements"] as const).map((k) => (
					<Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
						{k === "all" ? "Todos" : k === "local" ? "Locales" : k === "visiting" ? "Visitantes" : k === "congregations" ? "Congregaciones" : "Arreglos de discursos"}
					</Chip>
				))}
			</ChipGroup>

			{kindFilter === "congregations" ? (
				<CongregationsTable
					congregations={congregations}
					search={search}
					onSaved={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
					onDeleted={(id) => setCongregations((prev) => prev.filter((c) => c.id !== id))}
				/>
			) : kindFilter === "arrangements" ? (
				<ArrangementsPanel
					congregations={congregations}
					search={search}
					refreshKey={arrangementsRefresh}
					onSpeakersFetched={load}
				/>
			) : (
				<>
					{loading && <PageLoader />}
					{!loading && filtered.length === 0 && (
						<Card>
							<p className="text-sm text-ink-soft">No hay oradores registrados.</p>
						</Card>
					)}
					{!loading && filtered.length > 0 && (
						<List>
							{filtered.map((speaker) => {
								const mine = speaker.outlineIds
									.map((id) => outlineById.get(id))
									.filter((o): o is Outline => !!o)
									.sort((x, y) => x.number - y.number);
								const where = speaker.kind === "local" ? "Local" : (speaker.congregationName ?? "Visitante");
								const phoneHref = speaker.phone ? `tel:${speaker.phone.replace(/[^\d+]/g, "")}` : null;

								return (
									<div key={speaker.id} className="flex min-h-14 items-center gap-1 pl-4 pr-2">
										<button
											type="button"
											onClick={() => setEditingId(speaker.id)}
											className="min-w-0 flex-1 py-3 pr-2 text-left"
										>
											<div className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
												{speaker.fullName}
												{!speaker.active && <Badge tone="neutral">Inactivo</Badge>}
											</div>
											<div className="mt-0.5 text-[13px] text-ink-soft">{where}</div>
											<div className="mt-1.5 flex flex-wrap gap-1">
												{mine.length === 0 ? (
													<span className="text-[13px] text-ink-soft">Sin bosquejos</span>
												) : (
													mine.map((o) => (
														<span
															key={o.id}
															title={o.title}
															className="inline-flex min-w-8 items-center justify-center rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink"
														>
															{o.number}
														</span>
													))
												)}
											</div>
										</button>
										{phoneHref && <IconButton label="Llamar" icon={Phone} href={phoneHref} />}
									</div>
								);
							})}
						</List>
					)}
				</>
			)}

			<Modal open={congregationModalOpen} onClose={() => setCongregationModalOpen(false)} title="Nueva congregación">
				<div className="flex flex-col gap-3">
					<p className="text-sm text-ink-soft">
						Busca la congregación en JW.ORG con la lupa, copia su enlace de «Compartir» y pégalo aquí.
					</p>
					<HubAddRow
						onSaved={(c) => {
							setCongregations((prev) => upsertCongregation(prev, c));
							setCongregationModalOpen(false);
							setKindFilter("congregations");
						}}
					/>
				</div>
			</Modal>

			<AddArrangementModal
				open={arrangementModalOpen}
				onClose={() => setArrangementModalOpen(false)}
				congregations={congregations}
				onAdded={() => setArrangementsRefresh((n) => n + 1)}
			/>

			<DirectoryModal
				open={directoryOpen}
				onClose={() => setDirectoryOpen(false)}
				onAdded={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
			/>

			<SpeakerFormModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				outlines={outlines}
				songs={songs}
				congregations={congregations}
				onSaved={() => {
					setModalOpen(false);
					load();
				}}
				onCongregationSaved={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
			/>

			{editingSpeaker && (
				<EditSpeakerModal
					speaker={editingSpeaker}
					outlines={outlines}
					songs={songs}
					congregations={congregations}
					onClose={() => setEditingId(null)}
					onSaved={() => {
						setEditingId(null);
						load();
					}}
					onCongregationSaved={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
				/>
			)}
		</div>
	);
}

function SpeakerFormModal({
	open,
	onClose,
	outlines,
	songs,
	congregations,
	onSaved,
	onCongregationSaved,
}: {
	open: boolean;
	onClose: () => void;
	outlines: Outline[];
	songs: Song[];
	congregations: Congregation[];
	onSaved: () => void;
	onCongregationSaved: (c: Congregation) => void;
}) {
	const [kind, setKind] = useState<"local" | "visiting">("local");
	const [publisherSearch, setPublisherSearch] = useState("");
	const [publisherResults, setPublisherResults] = useState<PublisherResult[]>([]);
	const [selectedPublisher, setSelectedPublisher] = useState<PublisherResult | null>(null);
	const [fullName, setFullName] = useState("");
	const [phone, setPhone] = useState("");
	const [congregationId, setCongregationId] = useState("");
	const [selectedOutlines, setSelectedOutlines] = useState<Set<string>>(new Set());
	const [songByOutline, setSongByOutline] = useState<Record<string, number | null>>({});
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	function reset() {
		setSongByOutline({});
		setKind("local");
		setPublisherSearch("");
		setPublisherResults([]);
		setSelectedPublisher(null);
		setFullName("");
		setPhone("");
		setCongregationId("");
		setSelectedOutlines(new Set());
		setError(null);
	}

	async function searchPublishers(term: string) {
		setPublisherSearch(term);
		setSelectedPublisher(null);
		const response = await fetch(`/api/weekend/speakers/candidates?search=${encodeURIComponent(term)}`);
		if (response.ok) {
			const body = (await response.json()) as { items: PublisherResult[] };
			setPublisherResults(body.items);
		}
	}

	// Al abrir el modal ya se listan los publicadores con el privilegio.
	useEffect(() => {
		if (open) searchPublishers("");
	}, [open]);

	function toggleOutline(id: string) {
		setSelectedOutlines((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		const body =
			kind === "local"
				? { kind, userId: selectedPublisher?.id, outlineIds: [...selectedOutlines], outlineSongs: songByOutline }
				: {
						kind,
						fullName,
						phone: phone || null,
						congregationId: congregationId || null,
						outlineIds: [...selectedOutlines],
						outlineSongs: songByOutline,
					};
		const response = await fetch("/api/weekend/speakers", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setSaving(false);
		if (!response.ok) {
			const errBody = (await response.json().catch(() => ({}))) as { error?: string };
			setError(errBody.error === "already_registered" ? "Este publicador ya está registrado como orador." : "No se pudo guardar.");
			return;
		}
		reset();
		onSaved();
	}

	const canSave = kind === "local" ? !!selectedPublisher : fullName.trim().length > 0;

	return (
		<Modal
			open={open}
			onClose={() => {
				reset();
				onClose();
			}}
			title="Nuevo orador"
		>
			<div className="flex flex-col gap-3">
				<div className="flex gap-4 text-sm">
					<label className="flex items-center gap-1.5">
						<input type="radio" checked={kind === "local"} onChange={() => setKind("local")} />
						Orador local
					</label>
					<label className="flex items-center gap-1.5">
						<input type="radio" checked={kind === "visiting"} onChange={() => setKind("visiting")} />
						Orador visitante
					</label>
				</div>

				{kind === "local" ? (
					<div className="flex flex-col gap-2">
						<Input
							label="Buscar publicador"
							value={publisherSearch}
							onChange={(e) => searchPublishers(e.target.value)}
							placeholder="Nombre..."
						/>
						{selectedPublisher ? (
							<p className="text-sm text-ink">
								Seleccionado: <span className="font-medium">{selectedPublisher.fullName}</span>
								{selectedPublisher.phone ? ` — ${selectedPublisher.phone}` : ""}
							</p>
						) : (
							publisherResults.length === 0 ? (
								<p className="text-xs text-ink-soft">
									No hay publicadores disponibles con el privilegio «Orador de discurso público».
								</p>
							) : (
								<div className="flex max-h-40 flex-col overflow-y-auto rounded-2xl border border-border">
									{publisherResults.map((p) => (
										<button
											key={p.id}
											type="button"
											onClick={() => setSelectedPublisher(p)}
											className="min-h-11 px-4 py-2 text-left text-sm hover:bg-surface-alt"
										>
											{p.fullName}
										</button>
									))}
								</div>
							)
						)}
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
						<Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
						<CongregationPicker
							congregations={congregations}
							value={congregationId}
							onChange={setCongregationId}
							onCongregationSaved={onCongregationSaved}
							emptyLabel="Sin especificar"
						allowCreate={false}
						/>
					</div>
				)}

				<div>
					<p className="mb-1 text-sm font-medium text-ink">Bosquejos que puede dar</p>
					<OutlineChecklist
						outlines={outlines}
						selected={selectedOutlines}
						onToggle={toggleOutline}
						songs={songs}
						songByOutline={songByOutline}
						onSong={(id, song) => setSongByOutline((prev) => ({ ...prev, [id]: song }))}
					/>
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}
				<Button onClick={save} disabled={!canSave || saving} className="mt-2">
					{saving ? "Guardando..." : "Guardar"}
				</Button>
			</div>
		</Modal>
	);
}

function EditSpeakerModal({
	speaker,
	outlines,
	songs,
	congregations,
	onClose,
	onSaved,
	onCongregationSaved,
}: {
	speaker: Speaker;
	outlines: Outline[];
	songs: Song[];
	congregations: Congregation[];
	onClose: () => void;
	onSaved: () => void;
	onCongregationSaved: (c: Congregation) => void;
}) {
	const [phone, setPhone] = useState(speaker.phone ?? "");
	const [congregationId, setCongregationId] = useState(speaker.congregationId ?? "");
	const [active, setActive] = useState(speaker.active);
	const [selectedOutlines, setSelectedOutlines] = useState<Set<string>>(new Set(speaker.outlineIds));
	const [songByOutline, setSongByOutline] = useState<Record<string, number | null>>({ ...speaker.outlineSongs });
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	function toggleOutline(id: string) {
		setSelectedOutlines((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		const patch: Record<string, unknown> = { active, outlineIds: [...selectedOutlines], outlineSongs: songByOutline };
		if (speaker.kind === "visiting") {
			patch.phone = phone || null;
			patch.congregationId = congregationId || null;
		}
		const response = await fetch(`/api/weekend/speakers/${speaker.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(patch),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar.");
			return;
		}
		onSaved();
	}

	async function remove() {
		setSaving(true);
		const response = await fetch(`/api/weekend/speakers/${speaker.id}`, { method: "DELETE" });
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo eliminar — puede estar asignado a una reunión.");
			return;
		}
		onSaved();
	}

	return (
		<Modal open onClose={onClose} title={speaker.fullName}>
			<div className="flex flex-col gap-3">
				<p className="text-xs uppercase tracking-wide text-ink-soft">{speaker.kind === "local" ? "Orador local" : "Orador visitante"}</p>

				{speaker.kind === "visiting" && (
					<div className="flex flex-col gap-3">
						<Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
						<CongregationPicker
							congregations={congregations}
							value={congregationId}
							onChange={setCongregationId}
							onCongregationSaved={onCongregationSaved}
							emptyLabel="Sin especificar"
						allowCreate={false}
						/>
					</div>
				)}

				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
					Activo (disponible para asignar)
				</label>

				<div>
					<p className="mb-1 text-sm font-medium text-ink">Bosquejos que puede dar</p>
					<OutlineChecklist
						outlines={outlines}
						selected={selectedOutlines}
						onToggle={toggleOutline}
						songs={songs}
						songByOutline={songByOutline}
						onSong={(id, song) => setSongByOutline((prev) => ({ ...prev, [id]: song }))}
					/>
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}
				<div className="flex gap-2">
					<Button variant="danger" onClick={remove} disabled={saving}>
						Eliminar
					</Button>
					<Button onClick={save} disabled={saving} className="flex-1">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
