"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { JW_HUB_SEARCH_URL } from "@/lib/jw/hub";

export interface JwCongregationData {
	name: string;
	address: string;
	midweekDay: string;
	midweekTime: string;
	weekendDay: string;
	weekendTime: string;
}

const ERRORS: Record<string, string> = {
	invalid_url: "El enlace no es válido. Copia el enlace de «Compartir» de tu congregación en JW.ORG.",
	not_found: "No se encontró la congregación en JW.ORG.",
	unavailable: "No se pudo contactar a JW.ORG. Inténtalo de nuevo (o llena los datos a mano).",
	already_configured: "La aplicación ya fue configurada. Recarga la página.",
};

// Paso opcional del asistente: el usuario busca su congregación en JW.ORG (en
// otra pestaña), copia el enlace y aquí se traen sus datos para precargar el
// formulario. Quien no lo use simplemente llena los campos a mano.
export function JwCongregationLookup({ onFound }: { onFound: (data: JwCongregationData) => void }) {
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [found, setFound] = useState<string | null>(null);

	async function lookup() {
		setBusy(true);
		setError(null);
		setFound(null);
		try {
			const response = await fetch("/api/setup/jw", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: url.trim() }),
			});
			const body = (await response.json().catch(() => ({}))) as Partial<JwCongregationData> & { error?: string };
			if (!response.ok || !body.name) {
				setError(ERRORS[body.error ?? ""] ?? "No se pudieron obtener los datos de JW.ORG.");
				return;
			}
			onFound(body as JwCongregationData);
			setFound(body.name);
			setUrl("");
		} catch {
			setError(ERRORS.unavailable);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="flex flex-col gap-3 rounded-2xl bg-surface-alt p-4">
			<div>
				<h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
					<Globe size={15} /> Traer los datos desde JW.ORG <span className="text-xs font-normal text-ink-soft">(opcional)</span>
				</h3>
				<p className="mt-1 text-xs text-ink-soft">
					Busca tu congregación en JW.ORG, copia su enlace (el de «Compartir») y pégalo aquí: llenamos el nombre, la
					dirección del Salón y los horarios de reunión. Luego puedes ajustar lo que haga falta.
				</p>
			</div>
			<div className="flex flex-wrap items-end gap-2">
				<div className="min-w-[14rem] flex-1">
					<Input
						label="Enlace de tu congregación"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="Pega el enlace de JW.ORG"
						onKeyDown={(e) => {
							if (e.key === "Enter" && url.trim() && !busy) {
								e.preventDefault();
								void lookup();
							}
						}}
					/>
				</div>
				<Button type="button" variant="secondary" disabled={!url.trim() || busy} onClick={lookup}>
					{busy ? "Obteniendo..." : "Obtener datos"}
				</Button>
				<a
					href={JW_HUB_SEARCH_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-transparent px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
				>
					<ExternalLink size={15} /> Buscar en JW.ORG
				</a>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}
			{found && (
				<p className="flex items-start gap-1.5 text-sm text-ink">
					<CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
					Datos de «{found}» cargados abajo. Revisa el número de congregación, el circuito y el idioma, que JW.ORG no
					incluye.
				</p>
			)}
		</section>
	);
}
