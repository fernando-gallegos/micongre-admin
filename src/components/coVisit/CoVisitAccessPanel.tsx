"use client";

import { useEffect, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { formatShortDate } from "@/lib/dateFormat";

interface VisitOption {
	id: string;
	circuitOverseerName: string;
	startDate: string;
	endDate: string;
}

// Solo se muestra en la ficha de un publicador que ya tiene el privilegio
// co_visit_access otorgado (ver publishers/[id]/page.tsx) — evita ruido en
// publicadores normales.
export function CoVisitAccessPanel({ publisherId }: { publisherId: string }) {
	const [visits, setVisits] = useState<VisitOption[]>([]);
	const [visitId, setVisitId] = useState("");
	const [link, setLink] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/co-visit/schedules")
			.then((r) => r.json())
			.then((body: unknown) => setVisits((body as { items: VisitOption[] }).items));
	}, []);

	async function generateLink() {
		if (!visitId) return;
		setLoading(true);
		setLink(null);
		setCopied(false);
		setError(null);
		const response = await fetch(`/api/publishers/${publisherId}/access`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ purpose: "circuit_overseer_visit", visitId }),
		});
		setLoading(false);
		if (response.ok) {
			const body = (await response.json()) as { link: string };
			setLink(body.link);
		} else {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			setError(
				body?.error === "public_url_required"
					? "Primero escribe la dirección pública de la app en Congregación (Datos generales) para poder generar enlaces."
					: "No se pudo generar el enlace. Intenta de nuevo.",
			);
		}
	}

	async function copyLink() {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			// El enlace sigue visible en pantalla para copiarlo a mano.
		}
	}

	return (
		<Card>
			<h2 className="mb-1 font-display text-lg font-medium text-ink">Acceso de visita del SC</h2>
			<p className="mb-3 text-sm text-ink-soft">
				El enlace vence automáticamente al terminar la visita elegida — la sesión no se puede renovar después de
				esa fecha, aunque se siga usando la app.
			</p>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
				<Select label="Visita" value={visitId} onChange={(e) => setVisitId(e.target.value)} className="sm:flex-1">
					<option value="">Selecciona una visita</option>
					{visits.map((v) => (
						<option key={v.id} value={v.id}>
							{v.circuitOverseerName} ({formatShortDate(v.startDate)} – {formatShortDate(v.endDate)})
						</option>
					))}
				</Select>
				<Button onClick={generateLink} disabled={loading || !visitId} variant="secondary">
					<ShieldCheck size={18} />
					{loading ? "Generando..." : "Generar enlace"}
				</Button>
			</div>

			{error && <p className="text-sm text-red-600">{error}</p>}
			{link && (
				<div className="mt-3 flex items-center gap-1 rounded-2xl bg-surface-alt py-1 pl-3 pr-1">
					<code className="flex-1 truncate text-xs text-ink-soft">{link}</code>
					<IconButton label="Copiar enlace" icon={Copy} onClick={copyLink} />
					{copied && <span className="text-xs text-accent">Copiado</span>}
				</div>
			)}
		</Card>
	);
}
