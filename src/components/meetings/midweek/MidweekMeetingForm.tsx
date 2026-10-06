"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function MidweekMeetingForm({
	onCreated,
	initialDate = "",
}: {
	onCreated: () => void;
	initialDate?: string;
}) {
	const [meetingDate, setMeetingDate] = useState(initialDate);
	const [studyLessonReference, setStudyLessonReference] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError(null);

		const response = await fetch("/api/midweek", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingDate, studyLessonReference: studyLessonReference || null }),
		});

		setLoading(false);
		if (!response.ok) {
			setError("No se pudo crear la reunión (¿ya existe una para esa fecha?).");
			return;
		}
		onCreated();
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<Input
				label="Fecha de la reunión"
				type="date"
				value={meetingDate}
				onChange={(e) => setMeetingDate(e.target.value)}
				required
			/>
			<Input
				label="Referencia de la lección (opcional)"
				placeholder='p. ej. "Guía de actividades, semana del 6 de octubre"'
				value={studyLessonReference}
				onChange={(e) => setStudyLessonReference(e.target.value)}
			/>
			{error && <p className="text-sm text-red-600">{error}</p>}
			<Button type="submit" disabled={loading} className="mt-2">
				{loading ? "Creando..." : "Crear reunión"}
			</Button>
		</form>
	);
}
