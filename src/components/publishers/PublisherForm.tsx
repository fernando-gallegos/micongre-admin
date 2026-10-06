"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const GENDERS = [
	{ value: "male", label: "Varón" },
	{ value: "female", label: "Mujer" },
] as const;

const THEOCRATIC_STATUSES = [
	{ value: "student", label: "Estudiante" },
	{ value: "unbaptized_publisher", label: "Publicador no bautizado" },
	{ value: "baptized_publisher", label: "Publicador bautizado" },
] as const;

export function PublisherForm({ onCreated }: { onCreated: () => void }) {
	const [fullName, setFullName] = useState("");
	const [gender, setGender] = useState<string>("male");
	const [theocraticStatus, setTheocraticStatus] = useState<string>("baptized_publisher");
	const [birthDate, setBirthDate] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError(null);

		const response = await fetch("/api/publishers", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fullName,
				gender,
				theocraticStatus,
				birthDate: birthDate || null,
			}),
		});

		setLoading(false);
		if (!response.ok) {
			setError("No se pudo crear el publicador.");
			return;
		}
		onCreated();
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
			<Select label="Sexo" value={gender} onChange={(e) => setGender(e.target.value)}>
				{GENDERS.map((g) => (
					<option key={g.value} value={g.value}>
						{g.label}
					</option>
				))}
			</Select>
			<Select
				label="Condición teocrática"
				value={theocraticStatus}
				onChange={(e) => setTheocraticStatus(e.target.value)}
			>
				{THEOCRATIC_STATUSES.map((s) => (
					<option key={s.value} value={s.value}>
						{s.label}
					</option>
				))}
			</Select>
			<Input
				label="Fecha de nacimiento"
				type="date"
				value={birthDate}
				onChange={(e) => setBirthDate(e.target.value)}
			/>
			{error && <p className="text-sm text-red-600">{error}</p>}
			<Button type="submit" disabled={loading} className="mt-2">
				{loading ? "Guardando..." : "Guardar publicador"}
			</Button>
		</form>
	);
}
