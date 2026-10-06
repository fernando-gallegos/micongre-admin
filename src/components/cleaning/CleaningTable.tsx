"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Send, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { IconButton, List, Segmented } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
	CLEANING_KIND_FREQUENCY,
	CLEANING_KIND_HINT,
	CLEANING_KIND_LABEL,
	type CleaningKind,
	MONTH_NAMES_ES,
	weekOfMonthIndex,
} from "@/lib/cleaning/labels";
import { formatShortDate, formatShortDateTime } from "@/lib/dateFormat";
import { formatWeekRangeEs } from "@/lib/mwb/dates";
import { AssigneesCell } from "./AssigneesCell";
import { type CleaningRow, type CongregationOption, type GroupOption, refOf } from "./types";
import { PageLoader } from "@/components/ui/Spinner";

type Period = "upcoming" | "past";

const NOTIFY_ERRORS: Record<string, string> = {
	nothing_to_notify: "Está a cargo de otra congregación: no hay a quién avisar en la nuestra.",
	empty_recipients: "Los responsables no tienen integrantes a quienes avisar.",
	task_past: "Ya pasó la fecha.",
	meeting_cancelled: "La reunión está cancelada.",
	meeting_not_found: "La reunión ya no existe.",
};

const MEETING_LABEL = { midweek: "Entre semana", weekend: "Fin de semana" } as const;

function dateCell(row: CleaningRow) {
	if (row.kind === "profunda" && row.weekStart) {
		const month = MONTH_NAMES_ES[Number(row.weekStart.slice(5, 7)) - 1] ?? "";
		return (
			<>
				<span>{formatWeekRangeEs(row.weekStart)}</span>
				<span className="text-sm font-normal text-ink-soft">
					· Semana {weekOfMonthIndex(row.weekStart) + 1} de {month}
				</span>
			</>
		);
	}
	return <span>{formatShortDate(row.date)}</span>;
}

/** Texto de la columna "Notificación": solo cuenta a los responsables de
 * nuestra congregación — los de otras congregaciones no reciben avisos. */
function notificationCell(row: CleaningRow) {
	const ours = row.assignees.filter((a) => a.type !== "congregation");
	if (row.assignees.length === 0) return <span className="text-warn">Sin responsable</span>;
	if (ours.length === 0) return <span className="text-warn">No requiere aviso</span>;
	const sent = ours.filter((a) => a.notifiedAt);
	if (sent.length < ours.length) return <span className="text-ink-soft">Sin enviar</span>;
	const latest = sent.map((a) => a.notifiedAt as string).sort().at(-1);
	return <span className="text-ink-soft">Enviada {latest ? formatShortDateTime(latest) : ""}</span>;
}

export function CleaningTable({ kind }: { kind: CleaningKind }) {
	const [period, setPeriod] = useState<Period>("upcoming");
	const [rows, setRows] = useState<CleaningRow[]>([]);
	const [groups, setGroups] = useState<GroupOption[]>([]);
	const [congregations, setCongregations] = useState<CongregationOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [newDate, setNewDate] = useState("");
	const [newNotes, setNewNotes] = useState("");

	const load = useCallback(
		async (silent = false) => {
			if (!silent) setLoading(true);
			const response = await fetch(`/api/cleaning?kind=${kind}&period=${period}`);
			if (response.ok) {
				const body = (await response.json()) as { items: CleaningRow[]; groups: GroupOption[]; congregations: CongregationOption[] };
				setRows(body.items);
				setGroups(body.groups);
				setCongregations(body.congregations);
			} else {
				setMessage("No se pudo cargar la limpieza.");
			}
			setLoading(false);
		},
		[kind, period],
	);

	useEffect(() => {
		load();
	}, [load]);

	async function call(key: string, request: () => Promise<Response>, failure: string, onOk?: (response: Response) => Promise<void> | void) {
		setBusyKey(key);
		setMessage(null);
		const response = await request();
		if (response.ok) {
			await onOk?.(response);
		} else {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			setMessage((body?.error && NOTIFY_ERRORS[body.error]) || failure);
		}
		setBusyKey(null);
	}

	async function addAssignee(row: CleaningRow, value: string) {
		const ref = refOf(row);
		if (!ref) return;
		const [type, id] = value.split(":");
		const assignee =
			type === "group" && id
				? { type: "group", groupId: id }
				: type === "congregation" && id
					? { type: "congregation", congregationId: id }
					: { type: "own_congregation" };
		await call(
			row.key,
			() =>
				fetch("/api/cleaning/assignees", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ ref, assignee }),
				}),
			"No se pudo guardar la asignación.",
			async () => load(true),
		);
	}

	async function removeAssignee(row: CleaningRow, assigneeId: string) {
		await call(
			row.key,
			() => fetch(`/api/cleaning/assignees/${assigneeId}`, { method: "DELETE" }),
			"No se pudo quitar al responsable.",
			async () => load(true),
		);
	}

	async function toggleCompleted(row: CleaningRow) {
		const ref = refOf(row);
		if (!ref) return;
		await call(
			row.key,
			() =>
				fetch("/api/cleaning/complete", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ ref, done: !row.completedAt }),
				}),
			"No se pudo marcar la limpieza.",
			async () => load(true),
		);
	}

	async function notify(row: CleaningRow) {
		if (!row.taskId) return;
		await call(
			row.key,
			() => fetch(`/api/cleaning/tasks/${row.taskId}/notify`, { method: "POST" }),
			"No se pudo enviar la notificación.",
			async (response) => {
				const body = (await response.json()) as { sent: number };
				setMessage(`Notificación enviada (${body.sent} ${body.sent === 1 ? "persona" : "personas"}).`);
				await load(true);
			},
		);
	}

	async function removeThorough(row: CleaningRow) {
		if (!row.taskId || !window.confirm("¿Eliminar esta limpieza a fondo y sus avisos?")) return;
		await call(
			row.key,
			() => fetch(`/api/cleaning/tasks/${row.taskId}`, { method: "DELETE" }),
			"No se pudo eliminar la limpieza.",
			async () => load(true),
		);
	}

	async function scheduleThorough(event: React.FormEvent) {
		event.preventDefault();
		if (!newDate) return;
		await call(
			"new",
			() =>
				fetch("/api/cleaning/a-fondo", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ taskDate: newDate, notes: newNotes || null }),
				}),
			"No se pudo programar la limpieza.",
			async () => {
				setNewDate("");
				setNewNotes("");
				await load(true);
			},
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="px-1 text-sm text-ink-soft">
				<span className="font-medium text-ink">
					{CLEANING_KIND_LABEL[kind]} · {CLEANING_KIND_FREQUENCY[kind]}.
				</span>{" "}
				{CLEANING_KIND_HINT[kind]} Asignar no avisa: la notificación sale solo con «Enviar notificación» en la fila, y
				la asignación aparece en Mi panel de cada integrante.
			</p>

			{kind === "a_fondo" && (
				<Card>
					<form onSubmit={scheduleThorough} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
						<Input label="Fecha" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
						<div className="min-w-0 flex-1 sm:min-w-[14rem]">
							<Input label="Notas (opcional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} maxLength={500} />
						</div>
						<Button type="submit" disabled={busyKey === "new" || !newDate}>
							Programar
						</Button>
					</form>
				</Card>
			)}

			<Segmented
				value={period}
				onChange={setPeriod}
				label="Período"
				options={[
					{ value: "upcoming", label: "Próximas" },
					{ value: "past", label: "Anteriores" },
				]}
			/>

			{message && <p className="px-1 text-sm text-ink-soft">{message}</p>}

			{loading ? (
				<PageLoader />
			) : rows.length === 0 ? (
				<Card>
					<p className="text-sm text-ink-soft">
						{kind === "a_fondo"
							? "No hay limpiezas a fondo programadas."
							: period === "upcoming"
								? "No hay reuniones próximas programadas."
								: "No hay registros anteriores."}
					</p>
				</Card>
			) : (
				<List>
					{rows.map((row) => {
						const busy = busyKey === row.key;
						const ours = row.assignees.filter((a) => a.type !== "congregation");
						const canNotify = !!row.taskId && ours.length > 0 && !row.cancelled && period === "upcoming";
						const resend = ours.some((a) => a.notifiedAt);
						const notifyLabel =
							row.assignees.length === 0
								? "Asigna un responsable primero"
								: ours.length === 0
									? "Está a cargo de otra congregación: no hay a quién avisar"
									: period === "past"
										? "Ya pasó la fecha"
										: resend
											? "Reenviar notificación"
											: "Enviar notificación";
						return (
							<div key={row.key} className="py-2 pl-4 pr-1">
								<div className="flex items-center gap-1">
									<div className="min-w-0 flex-1 py-1">
										<div className="flex flex-wrap items-center gap-x-2 text-base font-semibold text-ink">
											{dateCell(row)}
											{kind === "ligera" && row.meetingType && (
												<span className="font-normal text-ink-soft">· {MEETING_LABEL[row.meetingType]}</span>
											)}
											{row.cancelled && <Badge tone="danger">Cancelada</Badge>}
										</div>
										{row.notes && <div className="mt-0.5 text-[13px] text-ink-soft">«{row.notes}»</div>}
										{!row.cancelled && (
											<div className="mt-0.5 text-xs">
												{row.completedAt && <span className="mr-2 font-semibold text-accent">Realizada</span>}
												{notificationCell(row)}
											</div>
										)}
									</div>
									{!row.cancelled && (
										<>
											<IconButton
												label={notifyLabel}
												icon={Send}
												tone={canNotify && !resend ? "accent" : "plain"}
												disabled={!canNotify || busy}
												onClick={() => notify(row)}
											/>
											<IconButton
												label={row.completedAt ? "Quitar la marca de realizada" : "Marcar realizada"}
												icon={Check}
												tone={row.completedAt ? "accent" : "plain"}
												disabled={busy}
												onClick={() => toggleCompleted(row)}
											/>
										</>
									)}
									{kind === "a_fondo" && (
										<IconButton label="Eliminar" icon={Trash2} tone="danger" disabled={busy} onClick={() => removeThorough(row)} />
									)}
								</div>
								{!row.cancelled && (
									<div className="pb-2 pr-3">
										<AssigneesCell
											assignees={row.assignees}
											groups={groups}
											congregations={congregations}
											disabled={busy}
											onAdd={(value) => addAssignee(row, value)}
											onRemove={(id) => removeAssignee(row, id)}
										/>
									</div>
								)}
							</div>
						);
					})}
				</List>
			)}
		</div>
	);
}
