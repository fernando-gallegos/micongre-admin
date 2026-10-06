"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

const NO_SPINNER = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Contador grande: − / número / +. El número también se puede escribir. */
function Counter({
	label,
	value,
	onChange,
	size,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	size: "lg" | "md";
}) {
	const step = (delta: number) => onChange(String(Math.max(0, Number(value || 0) + delta)));
	const big = size === "lg";
	const stepCls = `flex shrink-0 items-center justify-center rounded-full border border-border text-ink transition-colors hover:bg-surface-alt ${
		big ? "h-14 w-14" : "h-11 w-11"
	}`;
	return (
		<div className="flex flex-col items-center gap-1">
			<div className={`flex items-center ${big ? "gap-4" : "gap-3"}`}>
				<button type="button" aria-label={`Quitar uno (${label})`} onClick={() => step(-1)} className={stepCls}>
					<Minus size={big ? 24 : 20} />
				</button>
				<input
					type="number"
					inputMode="numeric"
					min="0"
					aria-label={label}
					placeholder="0"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={`bg-transparent text-center font-display font-medium leading-none text-ink placeholder:text-ink-soft/50 focus:outline-none ${NO_SPINNER} ${
						big ? "w-28 text-6xl" : "w-20 text-4xl"
					}`}
				/>
				<button type="button" aria-label={`Agregar uno (${label})`} onClick={() => step(1)} className={stepCls}>
					<Plus size={big ? 24 : 20} />
				</button>
			</div>
			<span className="text-[13px] text-ink-soft">{label}</span>
		</div>
	);
}

export function AttendanceForm({
	meetingType,
	meetingId,
	meetingDate,
	initialInPerson,
	initialZoom,
	onSaved,
}: {
	meetingType: "midweek" | "weekend";
	meetingId: string;
	meetingDate: string;
	initialInPerson: number | null;
	initialZoom: number | null;
	/** Se llama con los números guardados, para que la lista se actualice. */
	onSaved?: (counts: { inPersonCount: number; zoomCount: number }) => void;
}) {
	const [inPersonCount, setInPersonCount] = useState(initialInPerson?.toString() ?? "");
	const [zoomCount, setZoomCount] = useState(initialZoom?.toString() ?? "");
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(false);

	async function save() {
		setLoading(true);
		setSaved(false);
		const counts = { inPersonCount: Number(inPersonCount || 0), zoomCount: Number(zoomCount || 0) };
		const response = await fetch("/api/attendance", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingType, meetingId, meetingDate, ...counts }),
		});
		setLoading(false);
		if (response.ok) {
			setSaved(true);
			onSaved?.(counts);
		}
	}

	return (
		<div className="flex w-full flex-col items-center gap-6">
			<Counter
				label="Presentes en el salón"
				size="lg"
				value={inPersonCount}
				onChange={(v) => {
					setInPersonCount(v);
					setSaved(false);
				}}
			/>
			<Counter
				label="Conectados por Zoom"
				size="md"
				value={zoomCount}
				onChange={(v) => {
					setZoomCount(v);
					setSaved(false);
				}}
			/>
			<Button onClick={save} disabled={loading} className="min-h-[52px] w-full text-base">
				{saved ? <Check size={18} /> : null}
				{loading ? "Guardando..." : saved ? "Guardado" : "Guardar asistencia"}
			</Button>
		</div>
	);
}
