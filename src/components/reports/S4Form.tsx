"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clampProjectHours, maxProjectHours } from "@/lib/reports/projectHours";

interface Props {
	userId: string;
	fullName: string;
	periodYear: number;
	periodMonth: number;
	pioneerType: "auxiliary_pioneer" | "regular_pioneer" | null;
	initial?: {
		participatedInMinistry: boolean;
		isAuxiliaryPioneerThisMonth: boolean;
		hours: number | null;
		projectHours?: number | null;
		bibleStudiesCount: number | null;
	};
	onSaved: () => void;
}

export function S4Form({ userId, fullName, periodYear, periodMonth, pioneerType, initial, onSaved }: Props) {
	const [participatedInMinistry, setParticipatedInMinistry] = useState(initial?.participatedInMinistry ?? true);
	const isAuxiliaryPioneer = pioneerType === "auxiliary_pioneer";
	const showHours = pioneerType !== null;
	const showProjectHours = pioneerType === "regular_pioneer";
	const [hours, setHours] = useState(initial?.hours?.toString() ?? "");
	const [projectHours, setProjectHours] = useState(initial?.projectHours?.toString() ?? "");
	const projectMax = maxProjectHours(Number(hours) || 0);

	function handleHoursChange(value: string) {
		setHours(value);
		// Si el nuevo máximo de horas de proyecto queda por debajo de lo escrito, se ajusta (o se vacía).
		const clamped = clampProjectHours(Number(value) || 0, Number(projectHours) || 0);
		if (String(clamped ?? "") !== projectHours && Number(projectHours) > 0) setProjectHours(clamped?.toString() ?? "");
	}
	const [bibleStudiesCount, setBibleStudiesCount] = useState(initial?.bibleStudiesCount?.toString() ?? "0");
	const [comments, setComments] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError(null);

		const response = await fetch("/api/reports/s4", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				userId,
				periodYear,
				periodMonth,
				participatedInMinistry,
				isAuxiliaryPioneerThisMonth: isAuxiliaryPioneer,
				hours: showHours && hours ? Number(hours) : null,
				projectHours: showProjectHours ? clampProjectHours(Number(hours) || 0, Number(projectHours) || 0) : null,
				bibleStudiesCount: Number(bibleStudiesCount || 0),
				comments: comments || null,
			}),
		});

		setLoading(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			setError(body.error ?? "No se pudo guardar el informe.");
			return;
		}
		onSaved();
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<p className="text-sm text-ink-soft">Informe de {fullName}</p>
			<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
				<input
					className="h-5 w-5 accent-[var(--accent)]"
					type="checkbox"
					checked={participatedInMinistry}
					onChange={(e) => setParticipatedInMinistry(e.target.checked)}
				/>
				Participó en el ministerio este mes
			</label>
			{showHours && (
				<Input label="Horas (si aplica)" type="number" min="0" value={hours} onChange={(e) => handleHoursChange(e.target.value)} />
			)}
			{showProjectHours && projectMax > 0 && (
				<Input
					label={`Horas de proyectos (opcional, máx. ${projectMax})`}
					type="number"
					min="0"
					max={projectMax}
					step="any"
					value={projectHours}
					onChange={(e) => {
						const n = Number(e.target.value);
						setProjectHours(n > projectMax ? String(projectMax) : e.target.value);
					}}
				/>
			)}
			<Input
				label="Cursos bíblicos"
				type="number"
				min="0"
				value={bibleStudiesCount}
				onChange={(e) => setBibleStudiesCount(e.target.value)}
			/>
			<Input label="Comentarios (opcional)" value={comments} onChange={(e) => setComments(e.target.value)} />
			{error && <p className="text-sm text-warn">{error}</p>}
			<Button type="submit" disabled={loading} className="mt-2 w-full">
				{loading ? "Guardando..." : "Guardar informe"}
			</Button>
		</form>
	);
}
