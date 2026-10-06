"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, Send, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Chip, ChipGroup, IconButton, List } from "@/components/ui/Layout";
import { MONTH_NAMES, monthLabel } from "@/lib/federation/months";
import type { Congregation } from "./CongregationPicker";
import { PageLoader } from "@/components/ui/Spinner";

type Status = "planned" | "pending" | "accepted" | "rejected" | "counter";

interface Arrangement {
	id: string;
	congregationId: string;
	direction: "outgoing" | "incoming";
	year: number;
	month: number;
	status: Status;
	proposedYear: number | null;
	proposedMonth: number | null;
	speakersSyncedAt: string | null;
}

export const ERRORS: Record<string, string> = {
	month_taken: "Esa congregación ya tiene un arreglo en ese mes.",
	unreachable: "No se pudo contactar a la otra congregación. Revisa su URL e inténtalo de nuevo.",
	remote_error: "La otra congregación no aceptó la comunicación.",
	no_fork_url: "Primero guarda la URL de la congregación.",
	invalid_fork_url: "La URL no es válida (debe ser https://…).",
	fork_url_taken: "Otra congregación ya usa esa URL.",
	invalid_state: "El arreglo cambió de estado; recarga e inténtalo de nuevo.",
	notify_failed: "No se pudo avisar a la otra congregación.",
};

export async function request(url: string, method: string, body?: unknown) {
	try {
		const response = await fetch(url, {
			method,
			headers: body ? { "Content-Type": "application/json" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
		return { ok: response.ok, data, error: ERRORS[data.error ?? ""] ?? "No se pudo completar la acción." };
	} catch {
		return { ok: false, data: {} as Record<string, unknown>, error: "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo." };
	}
}

/** Elimina el arreglo de un mes. Si estaba aceptado se avisa al fork para que lo
 * rechace; si no se le puede avisar se pregunta si eliminarlo de todos modos. */
async function deleteArrangement(a: Pick<Arrangement, "id" | "status">): Promise<{ done: boolean; error?: string }> {
	if (a.status === "accepted" && !window.confirm("Este arreglo está aceptado. Se avisará a la otra congregación que se rechaza. ¿Eliminarlo?")) {
		return { done: false };
	}
	let response = await fetch(`/api/weekend/arrangements/${a.id}`, { method: "DELETE" });
	if (response.status === 502 && window.confirm("No se pudo avisar a la otra congregación. ¿Eliminarlo de todos modos?")) {
		response = await fetch(`/api/weekend/arrangements/${a.id}?force=true`, { method: "DELETE" });
	}
	return response.ok ? { done: true } : { done: false, error: ERRORS.notify_failed };
}

export function MonthYearFields({
	value,
	onChange,
}: {
	value: { year: number; month: number };
	onChange: (v: { year: number; month: number }) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<select
				value={value.month}
				onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
				className="min-h-12 rounded-2xl border border-border bg-surface px-4 py-2 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
			>
				{MONTH_NAMES.map((name, i) => (
					<option key={name} value={i + 1}>
						{name.charAt(0).toUpperCase() + name.slice(1)}
					</option>
				))}
			</select>
			<Input
				type="number"
				value={value.year}
				onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
				className="w-24"
				aria-label="Año"
			/>
		</div>
	);
}

function statusBadge(a: Arrangement) {
	if (a.status === "accepted") return <Badge tone="success">Aceptado</Badge>;
	if (a.status === "rejected") return <Badge tone="neutral">Rechazado</Badge>;
	if (a.status === "planned") return <Badge tone="neutral">Anotado</Badge>;
	if (a.status === "counter") {
		const month = a.proposedYear && a.proposedMonth ? monthLabel(a.proposedYear, a.proposedMonth) : "otro mes";
		return <Badge tone="warning">{a.direction === "outgoing" ? `Propuso ${month}` : `Propusiste ${month}`}</Badge>;
	}
	return <Badge tone="warning">{a.direction === "outgoing" ? "Esperando respuesta" : "Solicitó — espera tu respuesta"}</Badge>;
}

function ArrangementRow({
	arrangement: a,
	hasFork,
	onChanged,
	onSpeakersFetched,
}: {
	arrangement: Arrangement;
	hasFork: boolean;
	onChanged: () => void;
	onSpeakersFetched: () => void;
}) {
	const [editing, setEditing] = useState<"change" | "counter" | null>(null);
	const [value, setValue] = useState({ year: a.year, month: a.month });
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

	async function run(url: string, method: string, body?: unknown, onOk?: (data: Record<string, unknown>) => string | void) {
		setBusy(true);
		setMessage(null);
		const result = await request(url, method, body);
		setBusy(false);
		if (!result.ok) {
			setMessage({ text: result.error, error: true });
			return;
		}
		setEditing(null);
		const text = onOk?.(result.data);
		if (text) setMessage({ text, error: false });
		onChanged();
	}

	const act = (body: unknown, onOk?: (data: Record<string, unknown>) => string | void) =>
		run(`/api/weekend/arrangements/${a.id}/action`, "POST", body, onOk);

	const outgoing = a.direction === "outgoing";
	const canChangeMonth = outgoing && a.status !== "accepted";
	const sendLabel = a.status === "pending" ? "Reenviar solicitud" : "Solicitar arreglo";

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-medium text-ink">{monthLabel(a.year, a.month)}</span>
				{statusBadge(a)}
				<span className="text-xs text-ink-soft">{outgoing ? "Solicitado por nosotros" : "Solicitado por ellos"}</span>
				<div className="ml-auto flex flex-wrap items-center gap-1.5">
					{a.status === "planned" && (
						<Button variant="secondary" disabled={busy} onClick={() => act({ action: "accept-verbal" }, () => "Marcado como aceptado. Agrega los oradores de esa congregación a mano si aún no están.")}>
							Marcar como aceptado (verbal)
						</Button>
					)}
					{outgoing && hasFork && a.status !== "accepted" && a.status !== "counter" && (
						<Button variant="secondary" disabled={busy} onClick={() => act({ action: "request" })}>
							{sendLabel}
						</Button>
					)}
					{outgoing && a.status === "counter" && a.proposedYear && a.proposedMonth && (
						<Button disabled={busy} onClick={() => act({ action: "accept" })}>
							Aceptar {monthLabel(a.proposedYear, a.proposedMonth)}
						</Button>
					)}
					{!outgoing && a.status === "pending" && (
						<>
							<Button disabled={busy} onClick={() => act({ action: "accept" })}>
								Aceptar
							</Button>
							<Button variant="secondary" disabled={busy} onClick={() => act({ action: "reject" })}>
								Rechazar
							</Button>
						</>
					)}
					{(canChangeMonth || (!outgoing && (a.status === "pending" || a.status === "counter"))) && (
						<Button
							variant="ghost"
							disabled={busy}
							onClick={() => {
								setValue({ year: a.year, month: a.month });
								setEditing(outgoing ? "change" : "counter");
							}}
						>
							{outgoing ? "Cambiar mes" : "Proponer otro mes"}
						</Button>
					)}
					{a.status === "accepted" && hasFork && (
						<Button
							variant="secondary"
							disabled={busy}
							onClick={() =>
								act({ action: "fetch-speakers" }, (data) => {
									onSpeakersFetched();
									const r = data.result as { added: number; updated: number; total: number; unknownOutlines: number };
									return `Oradores recibidos: ${r.total} (${r.added} nuevos, ${r.updated} actualizados).${
										r.unknownOutlines > 0 ? ` ${r.unknownOutlines} bosquejos no están en tu catálogo.` : ""
									}`;
								})
							}
						>
							Obtener oradores
						</Button>
					)}
					<IconButton
						label="Eliminar"
						icon={Trash2}
						tone="danger"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							const result = await deleteArrangement(a);
							setBusy(false);
							if (result.error) setMessage({ text: result.error, error: true });
							if (result.done) onChanged();
						}}
					/>
				</div>
			</div>

			{editing && (
				<div className="flex flex-wrap items-center gap-2">
					<MonthYearFields value={value} onChange={setValue} />
					<Button
						disabled={busy}
						onClick={() =>
							editing === "change"
								? run(`/api/weekend/arrangements/${a.id}`, "PATCH", value)
								: act({ action: "counter", ...value })
						}
					>
						{editing === "change" ? "Guardar mes" : "Enviar propuesta"}
					</Button>
					<Button variant="ghost" onClick={() => setEditing(null)}>
						Cancelar
					</Button>
				</div>
			)}

			{a.speakersSyncedAt && a.status === "accepted" && !message && (
				<p className="text-xs text-ink-soft">Oradores obtenidos el {new Date(a.speakersSyncedAt).toLocaleDateString("es")}.</p>
			)}
			{message && <p className={`text-sm ${message.error ? "text-red-600" : "text-ink-soft"}`}>{message.text}</p>}
		</div>
	);
}

const STATUS_TEXT: Record<Status, string> = {
	planned: "Anotado",
	pending: "Esperando respuesta",
	counter: "Propuso otro mes",
	accepted: "Aceptado",
	rejected: "Rechazado",
};

interface Row {
	arrangement: Arrangement;
	congregation: Congregation;
}

type SortKey = "month" | "congregation" | "status";
interface Sort {
	key: SortKey;
	dir: "asc" | "desc";
}

const monthValue = (a: Arrangement) => a.year * 12 + a.month;

function compareRows(a: Row, b: Row, sort: Sort): number {
	const sign = sort.dir === "asc" ? 1 : -1;
	const primary =
		sort.key === "month"
			? monthValue(a.arrangement) - monthValue(b.arrangement)
			: sort.key === "congregation"
				? a.congregation.name.localeCompare(b.congregation.name)
				: STATUS_TEXT[a.arrangement.status].localeCompare(STATUS_TEXT[b.arrangement.status]);
	// Desempate: mes más reciente primero.
	return primary * sign || monthValue(b.arrangement) - monthValue(a.arrangement);
}

function ArrangementsTable({
	rows: unsorted,
	onView,
	onChanged,
}: {
	rows: Row[];
	onView: (arrangementId: string) => void;
	onChanged: () => void;
}) {
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Por defecto, por mes y año: del más nuevo al más viejo.
	const [sort, setSort] = useState<Sort>({ key: "month", dir: "desc" });
	const rows = [...unsorted].sort((a, b) => compareRows(a, b, sort));

	function toggleSort(key: SortKey) {
		setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "month" ? "desc" : "asc" }));
	}

	async function remove(a: Arrangement) {
		setBusyId(a.id);
		setError(null);
		const result = await deleteArrangement(a);
		setBusyId(null);
		if (result.error) setError(result.error);
		if (result.done) onChanged();
	}

	async function acceptVerbal(a: Arrangement) {
		if (!window.confirm("¿Marcar este arreglo como aceptado (acuerdo verbal)? No se avisa a la otra congregación; los oradores se agregan a mano.")) return;
		setBusyId(a.id);
		setError(null);
		const result = await request(`/api/weekend/arrangements/${a.id}/action`, "POST", { action: "accept-verbal" });
		setBusyId(null);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		onChanged();
	}

	async function send(a: Arrangement) {
		setBusyId(a.id);
		setError(null);
		const result = await request(`/api/weekend/arrangements/${a.id}/action`, "POST", { action: "request" });
		setBusyId(null);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		onChanged();
	}

	const SORTS: { key: SortKey; label: string }[] = [
		{ key: "month", label: "Mes y año" },
		{ key: "congregation", label: "Congregación" },
		{ key: "status", label: "Estado" },
	];

	return (
		<div className="flex flex-col gap-3">
			<ChipGroup>
				{SORTS.map(({ key, label }) => (
					<Chip key={key} active={sort.key === key} onClick={() => toggleSort(key)}>
						<span className="inline-flex items-center gap-1">
							{label}
							{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
						</span>
					</Chip>
				))}
			</ChipGroup>

			{rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">No hay arreglos de discursos. Agrega uno con «Agregar arreglo».</p>
				</Card>
			)}

			{rows.length > 0 && (
				<List>
					{rows.map(({ congregation: c, arrangement: a }) => {
						const canSend = a.direction === "outgoing" && !!c.forkUrl && ["planned", "pending", "rejected"].includes(a.status);
						return (
							<div key={a.id} className="flex flex-col gap-1 py-3 pl-4 pr-2">
								<div className="flex items-start justify-between gap-2 pr-2">
									<div className="min-w-0">
										<div className="text-base font-semibold text-ink">{monthLabel(a.year, a.month)}</div>
										<div className="mt-0.5 text-[13px] text-ink-soft">
											{c.name}
											{c.phone && (
												<>
													{" · "}
													<a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-accent hover:underline">
														{c.phone}
													</a>
												</>
											)}
										</div>
									</div>
									<div className="shrink-0">{statusBadge(a)}</div>
								</div>
								<div className="flex items-center justify-end">
									{canSend && (
										<IconButton
											label={a.status === "pending" ? "Reenviar solicitud" : "Enviar solicitud"}
											icon={Send}
											disabled={busyId === a.id}
											onClick={() => send(a)}
										/>
									)}
									{a.status === "planned" && (
										<IconButton
											label="Marcar como aceptado (acuerdo verbal)"
											icon={Check}
											disabled={busyId === a.id}
											onClick={() => acceptVerbal(a)}
										/>
									)}
									<IconButton label="Ver arreglo" icon={Eye} onClick={() => onView(a.id)} />
									<IconButton label="Eliminar" icon={Trash2} tone="danger" disabled={busyId === a.id} onClick={() => remove(a)} />
								</div>
							</div>
						);
					})}
				</List>
			)}
			{error && <p className="px-1 text-sm text-red-600">{error}</p>}
		</div>
	);
}

/** Agregar un arreglo: sólo una congregación ya registrada, mes y año. */
export function AddArrangementModal({
	open,
	onClose,
	congregations,
	onAdded,
}: {
	open: boolean;
	onClose: () => void;
	congregations: Congregation[];
	onAdded: () => void;
}) {
	const now = new Date();
	const [congregationId, setCongregationId] = useState("");
	const [value, setValue] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function close() {
		setCongregationId("");
		setError(null);
		onClose();
	}

	async function save() {
		setBusy(true);
		setError(null);
		const result = await request("/api/weekend/arrangements", "POST", { congregationId, ...value });
		setBusy(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		onAdded();
		close();
	}

	return (
		<Modal open={open} onClose={close} title="Agregar arreglo">
			<div className="flex flex-col gap-3">
				<Select label="Congregación" value={congregationId} onChange={(e) => setCongregationId(e.target.value)}>
					<option value="">Selecciona una congregación</option>
					{congregations.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</Select>
				<div className="flex flex-col gap-1">
					<span className="text-sm font-medium text-ink">Mes y año</span>
					<MonthYearFields value={value} onChange={setValue} />
				</div>
				{error && <p className="text-sm text-red-600">{error}</p>}
				<Button onClick={save} disabled={!congregationId || busy}>
					{busy ? "Guardando..." : "Guardar"}
				</Button>
			</div>
		</Modal>
	);
}

/** Pestaña "Arreglos de discursos": todos los arreglos por mes y su ciclo de vida. */
export function ArrangementsPanel({
	congregations,
	search,
	refreshKey,
	onSpeakersFetched,
}: {
	congregations: Congregation[];
	search: string;
	/** Cambia cuando se agrega un arreglo desde fuera del panel, para recargar. */
	refreshKey: number;
	onSpeakersFetched: () => void;
}) {
	const [arrangements, setArrangements] = useState<Arrangement[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const load = useCallback(async () => {
		const response = await fetch("/api/weekend/arrangements");
		if (response.ok) setArrangements(((await response.json()) as { items: Arrangement[] }).items);
		setLoaded(true);
	}, []);

	useEffect(() => {
		load();
	}, [load, refreshKey]);

	const byId = new Map(congregations.map((c) => [c.id, c]));
	const needle = search.trim().toLowerCase();
	const rows: Row[] = arrangements.flatMap((arrangement) => {
		const congregation = byId.get(arrangement.congregationId);
		return congregation && (!needle || congregation.name.toLowerCase().includes(needle)) ? [{ arrangement, congregation }] : [];
	});

	const selected = selectedId ? arrangements.find((a) => a.id === selectedId) : undefined;
	const selectedCongregation = selected ? byId.get(selected.congregationId) : undefined;

	if (!loaded) return <PageLoader />;
	return (
		<>
			<ArrangementsTable rows={rows} onView={setSelectedId} onChanged={load} />
			<Modal
				open={!!selected && !!selectedCongregation}
				onClose={() => setSelectedId(null)}
				title={selectedCongregation ? `Arreglo con ${selectedCongregation.name}` : "Arreglo"}
			>
				{selected && selectedCongregation && (
					<div className="flex flex-col gap-3">
						{!selectedCongregation.forkUrl && (
							<p className="text-sm text-ink-soft">
								Esta congregación no tiene la URL de su Mi Congre. Agrégala en Congregaciones para poder enviarle solicitudes.
							</p>
						)}
						<ArrangementRow
							arrangement={selected}
							hasFork={!!selectedCongregation.forkUrl}
							onChanged={load}
							onSpeakersFetched={onSpeakersFetched}
						/>
					</div>
				)}
			</Modal>
		</>
	);
}
