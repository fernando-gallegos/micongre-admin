"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { Congregation } from "./CongregationPicker";
import { InlineLoader } from "@/components/ui/Spinner";

interface DirectoryItem {
	subdomain: string;
	url: string;
	name: string | null;
	online: boolean;
	congregationId: string | null;
}

/** Elegir entre las congregaciones Mi Congre registradas en el router de subdominios. */
export function DirectoryModal({
	open,
	onClose,
	onAdded,
}: {
	open: boolean;
	onClose: () => void;
	onAdded: (c: Congregation) => void;
}) {
	const [items, setItems] = useState<DirectoryItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [adding, setAdding] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setItems(null);
		setError(null);
		fetch("/api/weekend/directory")
			.then((r) => r.json() as Promise<{ items: DirectoryItem[] }>)
			.then((body) => setItems(body.items))
			.catch(() => setError("No se pudo cargar el directorio."));
	}, [open]);

	async function add(item: DirectoryItem) {
		setAdding(item.url);
		setError(null);
		try {
			const response = await fetch("/api/weekend/directory", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: item.url }),
			});
			const body = (await response.json().catch(() => ({}))) as { congregation?: Congregation };
			if (!response.ok || !body.congregation) {
				setError("No se pudo agregar: esa congregación no respondió.");
				return;
			}
			onAdded(body.congregation);
			setItems((prev) => prev?.map((i) => (i.url === item.url ? { ...i, congregationId: body.congregation!.id } : i)) ?? prev);
		} catch {
			setError("No se pudo conectar. Inténtalo de nuevo.");
		} finally {
			setAdding(null);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Congregaciones de Mi Congre">
			<div className="flex flex-col gap-3">
				<p className="text-sm text-ink-soft">
					Congregaciones que usan un subdominio de Mi Congre. Al agregarla se guarda su dirección, lista para solicitarle arreglos.
				</p>
				{items === null && !error && <InlineLoader />}
				{items?.length === 0 && <p className="text-sm text-ink-soft">No hay otras congregaciones registradas.</p>}
				{items && items.length > 0 && (
					<div className="flex max-h-80 flex-col overflow-y-auto rounded-2xl border border-border">
						{items.map((item) => (
							<div key={item.url} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium text-ink">{item.name ?? item.subdomain}</p>
									<p className="truncate text-xs text-ink-soft">{item.url.replace("https://", "")}</p>
								</div>
								{item.congregationId ? (
									<Badge tone="success">Agregada</Badge>
								) : (
									<Button variant="secondary" disabled={adding !== null || !item.online} onClick={() => add(item)}>
										{!item.online ? "Sin respuesta" : adding === item.url ? "Agregando..." : "Agregar"}
									</Button>
								)}
							</div>
						))}
					</div>
				)}
				{error && <p className="text-sm text-red-600">{error}</p>}
			</div>
		</Modal>
	);
}
