"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton, List, ListRow } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { SelectAllControls } from "@/components/shared/SelectAllControls";

interface GrantedPrivilege {
	id: string;
	privilegeId: string;
	code: string;
	name: string;
	active: boolean;
}

interface PrivilegeOption {
	id: string;
	name: string;
	category: "meeting" | "operational" | "administrative";
}

const CATEGORY_LABELS: Record<string, string> = {
	meeting: "Reunión",
	operational: "Operativo",
	administrative: "Administrativo",
};

export function PrivilegesCard({
	publisherId,
	grantedPrivileges,
	compact = false,
	readOnly = false,
	onSaved,
}: {
	publisherId: string;
	grantedPrivileges: GrantedPrivilege[];
	// Sin la lista alrededor — solo el ícono disparador + el modal, para
	// usarse como acción de fila (p. ej. en la lista de personas).
	compact?: boolean;
	// Solo mirar (ancianos): sin catálogo ni casillas, solo lo ya otorgado.
	readOnly?: boolean;
	onSaved?: () => void;
}) {
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const [catalog, setCatalog] = useState<PrivilegeOption[]>([]);
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const activeGranted = grantedPrivileges.filter((p) => p.active);

	useEffect(() => {
		if (!modalOpen || readOnly) return;
		setChecked(new Set(activeGranted.map((p) => p.privilegeId)));
		fetch("/api/privileges")
			.then((r) => (r.ok ? r.json() : { items: [] }))
			.then((body: unknown) => setCatalog((body as { items?: PrivilegeOption[] }).items ?? []))
			.catch(() => setCatalog([]));
		// activeGranted se deriva de una prop que cambia por referencia en cada
		// render del padre — comparamos por el modal abriéndose, no por su valor.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modalOpen]);

	const grouped = useMemo(() => {
		const byCategory = new Map<string, PrivilegeOption[]>();
		for (const p of catalog) {
			const list = byCategory.get(p.category) ?? [];
			list.push(p);
			byCategory.set(p.category, list);
		}
		return byCategory;
	}, [catalog]);

	function toggle(id: string) {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		const response = await fetch(`/api/publishers/${publisherId}/privileges`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ privilegeIds: [...checked] }),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar. Intenta de nuevo.");
			return;
		}
		setModalOpen(false);
		router.refresh();
		onSaved?.();
	}

	const trigger = (
		<IconButton
			label={readOnly ? "Ver privilegios" : "Gestionar privilegios"}
			icon={ListChecks}
			onClick={() => setModalOpen(true)}
		/>
	);

	const modal = readOnly ? (
		<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Privilegios otorgados">
			{activeGranted.length === 0 && <p className="text-sm text-ink-soft">Ninguno registrado.</p>}
			<div className="max-h-[60vh] overflow-y-auto">
				<List>
					{activeGranted.map((p) => (
						<ListRow key={p.id} title={p.name} trailing={<Badge tone="success">Activo</Badge>} />
					))}
				</List>
			</div>
		</Modal>
	) : (
		<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Gestionar privilegios">
			<SelectAllControls
				onSelectAll={() => setChecked(new Set(catalog.map((p) => p.id)))}
				onClearAll={() => setChecked(new Set())}
			/>
			<div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
				{[...grouped.entries()].map(([category, items]) => (
					<div key={category}>
						<p className="mb-1 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-soft">
							{CATEGORY_LABELS[category] ?? category}
						</p>
						<div className="flex flex-col">
							{items.map((p) => (
								<label key={p.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm text-ink hover:bg-surface-alt">
									<input type="checkbox" className="h-5 w-5 accent-accent" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
									{p.name}
								</label>
							))}
						</div>
					</div>
				))}
			</div>
			{error && <p className="mt-3 text-sm text-red-600">{error}</p>}
			<Button onClick={handleSave} disabled={saving} className="mt-4 w-full">
				{saving ? "Guardando..." : "Guardar"}
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
				<h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Privilegios otorgados</h2>
				{!readOnly && trigger}
			</div>
			<List>
				{activeGranted.length === 0 && <div className="px-4 py-4 text-sm text-ink-soft">Ninguno registrado.</div>}
				{activeGranted.map((p) => (
					<ListRow key={p.id} title={p.name} trailing={<Badge tone="success">Activo</Badge>} />
				))}
			</List>
			{!readOnly && modal}
		</section>
	);
}
