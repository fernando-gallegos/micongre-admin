"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Music, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IconButton, List, ListRow, SectionLabel } from "@/components/ui/Layout";
import { formatShortDate } from "@/lib/dateFormat";
import { EpubOutlineImportDialog } from "./EpubOutlineImportDialog";
import { SongsImportDialog } from "./SongsImportDialog";
import { PageLoader } from "@/components/ui/Spinner";

interface Outline {
	id: string;
	number: number;
	category: string;
	title: string;
	active: boolean;
	lastGivenDate: string | null;
}

type SortBy = "category" | "number" | "title";

const SORT_LABELS: Record<SortBy, string> = {
	category: "Tema (categoría)",
	number: "Número",
	title: "Título",
};

const SORT_STORAGE_KEY = "weekend-outlines-sort";

function readStoredSort(): SortBy {
	try {
		const stored = localStorage.getItem(SORT_STORAGE_KEY);
		if (stored === "category" || stored === "number" || stored === "title") return stored;
	} catch {
		// localStorage puede fallar (modo privado, cuotas) — se usa el orden por defecto.
	}
	return "number";
}

function OutlineRow({ outline, onClick }: { outline: Outline; onClick: () => void }) {
	return (
		<ListRow
			onClick={onClick}
			title={
				<span className={`text-sm font-medium ${outline.active ? "text-ink" : "text-ink-soft line-through"}`}>
					{outline.number}. {outline.title}
				</span>
			}
			subtitle={outline.lastGivenDate ? formatLastGiven(outline.lastGivenDate) : undefined}
		/>
	);
}

function formatLastGiven(date: string | null): string | null {
	if (!date) return null;
	return formatShortDate(date);
}

export function TalkOutlinesList() {
	const [outlines, setOutlines] = useState<Outline[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [sortBy, setSortBy] = useState<SortBy>("number");
	const [addOpen, setAddOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [songsOpen, setSongsOpen] = useState(false);
	const [editing, setEditing] = useState<Outline | null>(null);

	useEffect(() => {
		setSortBy(readStoredSort());
	}, []);

	function changeSortBy(value: SortBy) {
		setSortBy(value);
		try {
			localStorage.setItem(SORT_STORAGE_KEY, value);
		} catch {
			// ignorar — el orden simplemente no persistirá esta sesión.
		}
	}

	const load = useCallback(async () => {
		setLoading(true);
		const response = await fetch("/api/weekend/outlines");
		if (response.ok) setOutlines(((await response.json()) as { items: Outline[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const filtered = outlines.filter(
		(o) => !search || o.title.toLowerCase().includes(search.toLowerCase()) || String(o.number).includes(search),
	);

	const byCategory = new Map<string, Outline[]>();
	if (sortBy === "category") {
		for (const outline of [...filtered].sort((a, b) => a.category.localeCompare(b.category))) {
			const list = byCategory.get(outline.category) ?? [];
			list.push(outline);
			byCategory.set(outline.category, list);
		}
		for (const list of byCategory.values()) list.sort((a, b) => a.number - b.number);
	}

	const flatSorted =
		sortBy === "number"
			? [...filtered].sort((a, b) => a.number - b.number)
			: sortBy === "title"
				? [...filtered].sort((a, b) => a.title.localeCompare(b.title))
				: [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-end gap-1">
				<IconButton label="Importar EPUB (S-99a)" icon={BookOpen} onClick={() => setImportOpen(true)} />
				<IconButton label="Importar canciones (JW.ORG o EPUB)" icon={Music} onClick={() => setSongsOpen(true)} />
				<Button onClick={() => setAddOpen(true)}>
					<Plus size={16} />
					Agregar bosquejo
				</Button>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div className="min-w-0 flex-1 sm:max-w-xs">
					<Input placeholder="Buscar por número o título" value={search} onChange={(e) => setSearch(e.target.value)} />
				</div>
				<div className="sm:max-w-[12rem]">
					<Select label="Ordenar por" value={sortBy} onChange={(e) => changeSortBy(e.target.value as SortBy)}>
						{(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
							<option key={key} value={key}>
								{SORT_LABELS[key]}
							</option>
						))}
					</Select>
				</div>
			</div>

			{loading && <PageLoader />}
			{!loading && filtered.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">No hay bosquejos en el catálogo todavía.</p>
				</Card>
			)}

			{sortBy === "category" ? (
				<div className="flex flex-col gap-5">
					{[...byCategory.entries()].map(([category, items]) => (
						<section key={category}>
							<SectionLabel>{category}</SectionLabel>
							<List>
								{items.map((outline) => (
									<OutlineRow key={outline.id} outline={outline} onClick={() => setEditing(outline)} />
								))}
							</List>
						</section>
					))}
				</div>
			) : (
				flatSorted.length > 0 && (
					<List>
						{flatSorted.map((outline) => (
							<OutlineRow key={outline.id} outline={outline} onClick={() => setEditing(outline)} />
						))}
					</List>
				)
			)}

			<OutlineFormModal
				open={addOpen}
				onClose={() => setAddOpen(false)}
				onSaved={() => {
					setAddOpen(false);
					load();
				}}
			/>
			<EpubOutlineImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
			<SongsImportDialog open={songsOpen} onClose={() => setSongsOpen(false)} />

			{editing && (
				<OutlineFormModal
					open
					outline={editing}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						load();
					}}
					onDeleted={() => {
						setEditing(null);
						load();
					}}
				/>
			)}
		</div>
	);
}

function OutlineFormModal({
	open,
	outline,
	onClose,
	onSaved,
	onDeleted,
}: {
	open: boolean;
	outline?: Outline;
	onClose: () => void;
	onSaved: () => void;
	onDeleted?: () => void;
}) {
	const [number, setNumber] = useState(outline ? String(outline.number) : "");
	const [category, setCategory] = useState(outline?.category ?? "");
	const [title, setTitle] = useState(outline?.title ?? "");
	const [active, setActive] = useState(outline?.active ?? true);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	async function save() {
		setSaving(true);
		setError(null);
		const body = { number: Number(number), category, title, ...(outline ? { active } : {}) };
		const response = await fetch(outline ? `/api/weekend/outlines/${outline.id}` : "/api/weekend/outlines", {
			method: outline ? "PATCH" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar — revisa que el número no esté repetido.");
			return;
		}
		onSaved();
	}

	async function remove() {
		if (!outline) return;
		setSaving(true);
		const response = await fetch(`/api/weekend/outlines/${outline.id}`, { method: "DELETE" });
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo eliminar — puede estar registrado en un orador o una reunión.");
			return;
		}
		onDeleted?.();
	}

	return (
		<Modal open={open} onClose={onClose} title={outline ? "Editar bosquejo" : "Agregar bosquejo"}>
			<div className="flex flex-col gap-3">
				<Input label="Número" type="number" value={number} onChange={(e) => setNumber(e.target.value)} required />
				<Input label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} required />
				<Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
				{outline && (
					<label className="flex items-center gap-2 text-sm">
						<input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
						Activo
					</label>
				)}
				{error && <p className="text-sm text-red-600">{error}</p>}
				<div className="flex gap-2">
					{outline && (
						<Button variant="danger" onClick={remove} disabled={saving}>
							Eliminar
						</Button>
					)}
					<Button onClick={save} disabled={saving || !number || !category || !title} className="flex-1">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
