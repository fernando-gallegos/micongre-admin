"use client";

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { JW_HUB_SEARCH_URL } from "@/lib/jw/hub";
import { Tooltip } from "@/components/ui/Tooltip";

export interface Congregation {
	id: string;
	name: string;
	phone: string | null;
	jwUrl: string | null;
	forkUrl: string | null;
	weekendMeetingDay: number | null;
	weekendMeetingTime: string | null;
	midweekMeetingDay: number | null;
	midweekMeetingTime: string | null;
}

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const ERRORS: Record<string, string> = {
	invalid_url: "El enlace no es válido. Copia el enlace de «Compartir» de la congregación en JW.ORG.",
	search_link: "Ese enlace es de una búsqueda, no de una congregación. Abre la congregación en JW.ORG, toca «Compartir» y pega aquí el enlace o el texto que se copia.",
	not_found: "No se encontró la congregación en JW.ORG.",
	unavailable: "No se pudo contactar a JW.ORG. Inténtalo de nuevo.",
	name_conflict: "JW.ORG cambió el nombre a uno que ya existe en otra congregación.",
};

/** Agrega o reemplaza una congregación en la lista, manteniéndola ordenada por nombre. */
export function upsertCongregation(list: Congregation[], c: Congregation): Congregation[] {
	return [...list.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name));
}

export function meetingLabel(day: number | null, time: string | null): string | null {
	if (day == null || !time) return null;
	return `${WEEKDAYS[day] ?? ""}, ${time}`;
}

const ICON_BUTTON = "px-2.5";

const NETWORK_ERROR = "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";

/** POST que nunca lanza: devuelve el cuerpo y un mensaje de error si algo falló. */
async function postJson(url: string, body?: unknown): Promise<{ congregation?: Congregation; error?: string }> {
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: body ? { "Content-Type": "application/json" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = (await response.json().catch(() => ({}))) as { congregation?: Congregation; error?: string };
		if (response.ok && data.congregation) return { congregation: data.congregation };
		return { error: ERRORS[data.error ?? ""] ?? "No se pudo obtener los datos de la congregación." };
	} catch {
		return { error: NETWORK_ERROR };
	}
}

/** Botón de refrescar los datos de una congregación desde JW.ORG. */
export function SyncFromHubButton({
	congregationId,
	onSaved,
	onError,
}: {
	congregationId: string;
	onSaved: (c: Congregation) => void;
	onError: (message: string) => void;
}) {
	const [busy, setBusy] = useState(false);

	async function sync() {
		setBusy(true);
		const result = await postJson(`/api/weekend/congregations/${congregationId}/sync`);
		setBusy(false);
		if (!result.congregation) {
			onError(result.error!);
			return;
		}
		onSaved(result.congregation);
	}

	return (
		<Button
			type="button"
			variant="secondary"
			className={ICON_BUTTON}
			title="Actualizar datos desde JW.ORG"
			aria-label="Actualizar datos desde JW.ORG"
			disabled={busy}
			onClick={sync}
		>
			<RefreshCw size={16} className={busy ? "animate-spin" : ""} />
		</Button>
	);
}

/** Fila "Nueva congregación": pega el enlace de JW.ORG, Agregar y lupa para buscarlo. */
export function HubAddRow({ onSaved }: { onSaved: (c: Congregation) => void }) {
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function add() {
		setBusy(true);
		setError(null);
		const result = await postJson("/api/weekend/congregations", { url: url.trim() });
		setBusy(false);
		if (!result.congregation) {
			setError(result.error!);
			return;
		}
		onSaved(result.congregation);
		setUrl("");
	}

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-end gap-2">
				<div className="min-w-0 flex-1">
					<Input
						label="Nueva congregación"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="Pega el enlace o el texto que copia JW.ORG"
					/>
				</div>
				<Button type="button" variant="secondary" disabled={!url.trim() || busy} onClick={add}>
					{busy ? "Obteniendo..." : "Agregar"}
				</Button>
				<Tooltip content="Buscar en JW.ORG">
					<a
						href={JW_HUB_SEARCH_URL}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Buscar"
						className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-full border border-border bg-surface px-2.5 text-ink transition-colors hover:bg-surface-alt"
					>
						<Search size={16} />
					</a>
				</Tooltip>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	);
}

export function CongregationPicker({
	congregations,
	value,
	onChange,
	onCongregationSaved,
	emptyLabel,
	allowCreate = true,
}: {
	congregations: Congregation[];
	value: string;
	onChange: (id: string) => void;
	onCongregationSaved: (c: Congregation) => void;
	emptyLabel: string;
	/** Si es false se oculta "Nueva congregación" (se agregan en Oradores › Congregaciones). */
	allowCreate?: boolean;
}) {
	const [error, setError] = useState<string | null>(null);

	const selected = congregations.find((c) => c.id === value) ?? null;
	const meeting = selected ? meetingLabel(selected.weekendMeetingDay, selected.weekendMeetingTime) : null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<div className="flex items-end gap-2">
					<div className="min-w-0 flex-1">
						<Select label="Congregación" value={value} onChange={(e) => onChange(e.target.value)}>
							<option value="">{emptyLabel}</option>
							{congregations.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</Select>
					</div>
					{selected?.jwUrl && (
						<SyncFromHubButton
							congregationId={selected.id}
							onSaved={(c) => {
								setError(null);
								onCongregationSaved(c);
							}}
							onError={setError}
						/>
					)}
				</div>
				{selected && (
					<p className="text-xs text-ink-soft">
						{meeting ? `Reunión del fin de semana: ${meeting}` : "Sin horario de reunión del fin de semana registrado."}
					</p>
				)}
			</div>

			{allowCreate && (
				<HubAddRow
					onSaved={(c) => {
						setError(null);
						onCongregationSaved(c);
						onChange(c.id);
					}}
				/>
			)}
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	);
}
