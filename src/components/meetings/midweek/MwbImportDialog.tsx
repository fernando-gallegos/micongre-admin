"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatWeekRangeEs } from "@/lib/mwb/dates";

interface WeekResult {
	weekStart: string;
	weekLabel: string | null;
	action: "created" | "replaced" | "updated" | "not_found";
}

const ACTION_LABELS: Record<WeekResult["action"], string> = {
	created: "creada",
	replaced: "programa reemplazado",
	updated: "títulos y partes actualizados (asignaciones conservadas)",
	not_found: "no está en la guía",
};

const ERROR_MESSAGES: Record<string, string> = {
	week_not_found: "No se encontró el programa de ese mes en el número descargado de JW.ORG.",
	upstream_error: "No se pudo contactar a JW.ORG.",
	invalid_body: "Datos inválidos.",
};

export function MwbImportDialog({
	open,
	onClose,
	weekStart,
	onImported,
}: {
	open: boolean;
	onClose: () => void;
	weekStart: string;
	onImported: () => void;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [results, setResults] = useState<WeekResult[] | null>(null);

	async function runImport() {
		setLoading(true);
		setError(null);

		const response = await fetch("/api/midweek/import", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingDate: weekStart, weekStart }),
		});
		setLoading(false);

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
			setError(body.message ?? ERROR_MESSAGES[body.error ?? ""] ?? "No se pudo importar el programa.");
			return;
		}

		const body = (await response.json()) as { weeks: WeekResult[] };
		setResults(body.weeks);
		onImported();
	}

	function handleClose() {
		setResults(null);
		setError(null);
		onClose();
	}

	const monthName = new Intl.DateTimeFormat("es", { month: "long", timeZone: "UTC" }).format(
		new Date(`${weekStart}T00:00:00Z`),
	);

	return (
		<Modal open={open} onClose={handleClose} title="Importar de JW.ORG">
			<div className="flex flex-col gap-3">
				{!results && (
					<>
						<p className="text-sm text-ink-soft">
							Se descarga la Guía de actividades oficial (mwb) desde JW.ORG y se importan todas las reuniones de{" "}
							{monthName} (semana seleccionada: {formatWeekRangeEs(weekStart)}).
						</p>
						<ul className="list-disc pl-5 text-sm text-ink-soft">
							<li>Las semanas sin ningún asignado se reemplazan por completo con el programa de la guía.</li>
							<li>
								Las semanas con asignados conservan a las personas: se actualizan los títulos, duraciones y
								canciones, y se agregan las partes nuevas. Las partes que no estén en la guía (por ejemplo,
								asignaciones personalizadas) se borran junto con su asignado.
							</li>
						</ul>
						{error && <p className="text-sm text-red-600">{error}</p>}
						<Button disabled={loading} onClick={runImport} className="mt-2">
							{loading ? "Importando..." : "Importar el mes"}
						</Button>
					</>
				)}

				{results && (
					<div className="flex flex-col gap-3">
						<ul className="flex flex-col gap-1 text-sm text-ink">
							{results.map((week) => (
								<li key={week.weekStart}>
									<span className="font-medium">{week.weekLabel ?? formatWeekRangeEs(week.weekStart)}</span>:{" "}
									{ACTION_LABELS[week.action]}
								</li>
							))}
						</ul>
						<Button onClick={handleClose}>Listo</Button>
					</div>
				)}
			</div>
		</Modal>
	);
}
