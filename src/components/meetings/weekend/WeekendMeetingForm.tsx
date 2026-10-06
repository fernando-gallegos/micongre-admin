"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function WeekendMeetingForm({
	initialDate,
	onCreated,
}: {
	initialDate?: string;
	onCreated: () => void;
}) {
	const [meetingDate, setMeetingDate] = useState(initialDate ?? "");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError(null);

		const response = await fetch("/api/weekend", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingDate }),
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
			{error && <p className="text-sm text-red-600">{error}</p>}
			<Button type="submit" disabled={loading} className="mt-2">
				{loading ? "Creando..." : "Crear reunión"}
			</Button>
		</form>
	);
}
