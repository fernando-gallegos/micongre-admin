"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";

type Job = "daily" | "assignments";

interface DailyResult {
	midweek: { created: number; imported: number; skeletons: number; filled: number; errors: string[] };
	weekend: { created: number };
	congregations: { checked: number; updated: number; failed: { name: string; reason: string }[] };
	reports: { monthName: string; pending: number; pushes: number } | null;
}
interface AssignmentsResult {
	ran: boolean;
	reason?: string;
	kind?: "week" | "weekend";
	users?: number;
	pushes?: number;
}

function describeDaily(r: DailyResult): string[] {
	const lines = [
		r.midweek.created + r.midweek.filled === 0
			? "Entre semana: ya estaba todo armado."
			: `Entre semana: ${r.midweek.created} reuniones creadas (${r.midweek.imported} con la guía, ${r.midweek.skeletons} solo con partes fijas) y ${r.midweek.filled} completadas con la guía.`,
		r.weekend.created === 0 ? "Fin de semana: ya estaba todo armado." : `Fin de semana: ${r.weekend.created} reuniones creadas.`,
		r.congregations.checked === 0
			? "Congregaciones: ninguna tiene enlace de jw.org."
			: `Congregaciones: ${r.congregations.updated} de ${r.congregations.checked} actualizadas${r.congregations.failed.length ? `; con problema: ${r.congregations.failed.map((f) => f.name).join(", ")}` : ""}.`,
	];
	if (r.reports) {
		lines.push(
			r.reports.pending === 0
				? `Informes de ${r.reports.monthName}: todos los publicadores con cuenta ya lo enviaron.`
				: `Informes de ${r.reports.monthName}: ${r.reports.pending} sin enviar; recordatorio push a ${r.reports.pushes}.`,
		);
	}
	for (const e of r.midweek.errors) lines.push(`Aviso: ${e}`);
	return lines;
}

function describeAssignments(r: AssignmentsResult): string[] {
	if (!r.ran) return [`No se envió: ${r.reason === "disabled" ? "el recordatorio está desactivado (falta la hora en Congregación)." : r.reason}`];
	const kind = r.kind === "weekend" ? "del fin de semana" : "de la semana";
	return [r.users ? `Se avisó a ${r.users} personas de sus asignaciones ${kind} (${r.pushes ?? 0} push).` : `Nadie tiene asignaciones ${kind}: no se envió nada.`];
}

// Disparo manual de los dos jobs programados (solo administradores). Ver "Jobs programados" en CLAUDE.md.
export function JobsCard() {
	const [running, setRunning] = useState<Job | null>(null);
	const [confirming, setConfirming] = useState<Job | null>(null);
	const [lines, setLines] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function run(job: Job) {
		setRunning(job);
		setError(null);
		setLines(null);
		setConfirming(null);
		try {
			const response = await fetch("/api/congregation/jobs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ job }),
			});
			if (!response.ok) throw new Error("failed");
			const data = (await response.json()) as { result: DailyResult | AssignmentsResult };
			setLines(job === "daily" ? describeDaily(data.result as DailyResult) : describeAssignments(data.result as AssignmentsResult));
		} catch {
			setError("No se pudo ejecutar el job. Intenta de nuevo.");
		} finally {
			setRunning(null);
		}
	}

	return (
		<section>
			<SectionLabel>Jobs programados</SectionLabel>
			<Card className="flex flex-col gap-4 p-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="text-sm font-semibold text-ink">Job diario</p>
						<p className="text-xs text-ink-soft">
							Arma los programas del mes y el siguiente, actualiza las congregaciones con enlace de jw.org y recuerda por push el informe del mes pasado a quien aún no lo envió.
							Corre solo cada día; al ejecutarlo ahora, el recordatorio se envía de verdad.
						</p>
					</div>
					<Button variant="secondary" disabled={running !== null} onClick={() => setConfirming("daily")} className="shrink-0">
						{running === "daily" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
						Ejecutar ahora
					</Button>
				</div>
				<div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="text-sm font-semibold text-ink">Job de asignaciones</p>
						<p className="text-xs text-ink-soft">Avisa a cada persona de sus asignaciones. Corre solo los lunes y viernes; al ejecutarlo ahora se envía de verdad, sin importar el día ni la hora.</p>
					</div>
					<Button variant="secondary" disabled={running !== null} onClick={() => setConfirming("assignments")} className="shrink-0">
						{running === "assignments" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
						Ejecutar ahora
					</Button>
				</div>
				{error && <p className="text-sm text-red-600">{error}</p>}
				{lines && (
					<ul className="list-disc pl-5 text-sm text-ink">
						{lines.map((l) => (
							<li key={l}>{l}</li>
						))}
					</ul>
				)}
			</Card>

			<Modal
				open={confirming !== null}
				onClose={() => setConfirming(null)}
				title={confirming === "daily" ? "Ejecutar el Job diario" : "Ejecutar el Job de asignaciones"}
			>
				<div className="flex flex-col gap-4">
					<p className="text-sm text-ink">
						{confirming === "daily"
							? "Se armarán los programas que falten, se actualizarán las congregaciones y se enviará ahora un recordatorio por push del informe del mes pasado a quien todavía no lo ha enviado. Los push no se pueden deshacer. ¿Continuar?"
							: "Se enviará ahora un aviso (y un push) a cada persona que tenga asignaciones: de la semana si hoy no es viernes, o del fin de semana si lo es. No se puede deshacer. ¿Continuar?"}
					</p>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setConfirming(null)}>
							Cancelar
						</Button>
						<Button onClick={() => confirming && run(confirming)}>{confirming === "daily" ? "Ejecutar ahora" : "Enviar ahora"}</Button>
					</div>
				</div>
			</Modal>
		</section>
	);
}
