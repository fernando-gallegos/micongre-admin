"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { Input } from "@/components/ui/Input";
import { InlineLoader } from "@/components/ui/Spinner";

interface HallCongregation {
	id: string;
	name: string;
	active: boolean;
}

// Otras congregaciones que usan el mismo Salón del Reino. Se les puede asignar
// una limpieza (sola, o junto con la nuestra) — nadie de nuestra congregación
// recibe aviso por lo que quede a cargo de ellas.
export function HallCongregationsCard({ onChanged }: { onChanged: () => void }) {
	const [items, setItems] = useState<HallCongregation[]>([]);
	const [loading, setLoading] = useState(true);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		const response = await fetch("/api/cleaning/congregations");
		if (response.ok) setItems(((await response.json()) as { items: HallCongregation[] }).items);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	async function add(event: React.FormEvent) {
		event.preventDefault();
		if (!name.trim()) return;
		setBusy(true);
		setMessage(null);
		const response = await fetch("/api/cleaning/congregations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (response.ok) {
			setName("");
			await load();
			onChanged();
		} else {
			setMessage("No se pudo agregar la congregación.");
		}
		setBusy(false);
	}

	async function toggleActive(item: HallCongregation) {
		setBusy(true);
		setMessage(null);
		const response = await fetch(`/api/cleaning/congregations/${item.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ active: !item.active }),
		});
		if (!response.ok) setMessage("No se pudo actualizar la congregación.");
		await load();
		onChanged();
		setBusy(false);
	}

	async function remove(item: HallCongregation) {
		if (!window.confirm(`¿Eliminar a ${item.name}?`)) return;
		setBusy(true);
		setMessage(null);
		const response = await fetch(`/api/cleaning/congregations/${item.id}`, { method: "DELETE" });
		if (response.status === 409) {
			setMessage(`${item.name} ya figura en alguna limpieza: desactívala en vez de eliminarla.`);
		} else if (!response.ok) {
			setMessage("No se pudo eliminar la congregación.");
		}
		await load();
		onChanged();
		setBusy(false);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="px-1 text-sm text-ink-soft">
				Agrega las otras congregaciones del salón para poder asignarles limpiezas — por ejemplo la limpieza
				profunda de ciertas semanas, o participar junto con la nuestra en la limpieza a fondo. Lo que quede a
				cargo de otra congregación no genera avisos en la nuestra.
			</p>

			<Card>
				<form onSubmit={add} className="flex items-end gap-2">
					<div className="min-w-0 flex-1">
						<Input label="Nombre de la congregación" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
					</div>
					<Button type="submit" disabled={busy || !name.trim()}>
						Agregar
					</Button>
				</form>
			</Card>

			{message && <p className="px-1 text-sm text-ink-soft">{message}</p>}

			<section>
				<SectionLabel>Congregaciones que comparten el Salón del Reino</SectionLabel>
				{loading ? (
					<InlineLoader />
				) : items.length === 0 ? (
					<Card>
						<p className="text-sm text-ink-soft">Todavía no hay otras congregaciones. Si el salón es solo de la nuestra, no hace falta agregar ninguna.</p>
					</Card>
				) : (
					<List>
						{items.map((item) => (
							<div key={item.id} className="flex min-h-14 items-center gap-1 py-1 pl-4 pr-1">
								<span className="min-w-0 flex-1 text-base font-semibold text-ink">{item.name}</span>
								{!item.active && <Badge tone="neutral">Inactiva</Badge>}
								<Button variant="ghost" disabled={busy} onClick={() => toggleActive(item)}>
									{item.active ? "Desactivar" : "Activar"}
								</Button>
								<IconButton label="Eliminar" icon={Trash2} tone="danger" disabled={busy} onClick={() => remove(item)} />
							</div>
						))}
					</List>
				)}
			</section>
		</div>
	);
}
