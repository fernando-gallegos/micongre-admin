"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { Spinner } from "@/components/ui/Spinner";
import { mapWithLimit } from "@/lib/http/pool";
import { confirmDiscardChanges, useUnsavedChanges } from "@/lib/useUnsavedChanges";
import type { PlannerCell, PlannerModule, PlannerMonth } from "@/lib/planner/month";

const TITLES: Record<PlannerModule, string> = { midweek: "Entre semana", weekend: "Fin de semana", operational: "Acomodadores" };
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function shortDate(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Un día a mitad del mes siguiente/anterior (cada semana cuenta en el mes de su lunes, así que el día 15 no es ambiguo). */
function shiftMonth(iso: string, delta: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 15)).toISOString().slice(0, 10);
}

type Drafts = Record<string, string | null>; // `${meetingId}|${target}` → persona

/** Botón «Vista mensual» para el encabezado de cada planificador. Al cerrar avisa con `onClosed` para recargar la vista semanal. */
export function MonthPlannerButton({ module, date, onClosed }: { module: PlannerModule; date: string; onClosed?: () => void }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<IconButton label="Vista mensual (pantalla completa)" icon={CalendarRange} onClick={() => setOpen(true)} />
			{open && (
				<MonthPlanner
					module={module}
					initialDate={date}
					onClose={() => {
						setOpen(false);
						onClosed?.();
					}}
				/>
			)}
		</>
	);
}

/** Planificador del mes en pantalla completa: a la izquierda las asignaciones y arriba las reuniones; se guarda todo junto. */
export function MonthPlanner({ module, initialDate, onClose }: { module: PlannerModule; initialDate: string; onClose: () => void }) {
	const [date, setDate] = useState(initialDate);
	const [data, setData] = useState<PlannerMonth | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [drafts, setDrafts] = useState<Drafts>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const dirty = Object.keys(drafts).length > 0;
	useUnsavedChanges(dirty);

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const res = await fetch(`/api/planner/month?module=${module}&date=${date}`);
			if (!res.ok) throw new Error();
			setData((await res.json()) as PlannerMonth);
		} catch {
			setLoadError("No se pudo cargar el mes. Revisa la conexión e intenta de nuevo.");
		} finally {
			setLoading(false);
		}
	}, [module, date]);

	useEffect(() => {
		load();
	}, [load]);

	// Pantalla completa: sin desplazar la página de atrás; Esc cierra.
	useEffect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, []);

	const close = useCallback(() => {
		if (dirty && !confirmDiscardChanges()) return;
		onClose();
	}, [dirty, onClose]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);

	function changeMonth(delta: number) {
		if (dirty && !confirmDiscardChanges()) return;
		setDrafts({});
		setErrors({});
		setMessage(null);
		setDate((d) => shiftMonth(d, delta));
	}

	const shown = useCallback(
		(meetingId: string, cell: PlannerCell) => {
			const key = `${meetingId}|${cell.target}`;
			return key in drafts ? drafts[key] : cell.value;
		},
		[drafts],
	);

	// Personas repetidas en una misma reunión (aviso, no bloquea).
	const repeated = useMemo(() => {
		const out = new Set<string>();
		if (!data) return out;
		for (const col of data.columns) {
			const count = new Map<string, number>();
			for (const row of data.rows) {
				const cell = data.cells[row.key]?.[col.meetingId];
				const v = cell?.target ? shown(col.meetingId, cell) : null;
				if (v) count.set(v, (count.get(v) ?? 0) + 1);
			}
			for (const [userId, n] of count) if (n > 1) out.add(`${col.meetingId}|${userId}`);
		}
		return out;
	}, [data, shown]);

	async function save() {
		if (!data) return;
		setSaving(true);
		setMessage(null);
		const meetingType = new Map(data.columns.map((c) => [c.meetingId, c.meetingType]));
		// Una petición por reunión (campos de la reunión), por parte o por asignación de acomodadores.
		const requests = new Map<string, { url: string; body: Record<string, string | null>; keys: string[] }>();
		for (const [key, value] of Object.entries(drafts)) {
			const [meetingId, target] = key.split("|");
			const parts = target.split(":");
			let id: string;
			let url: string;
			let field: string;
			if (parts[0] === "o") {
				id = `o:${parts[1]}`;
				url = `/api/operational/${parts[1]}`;
				field = "assignedUserId";
			} else if (parts[0] === "a") {
				id = `a:${parts[1]}`;
				url = `/api/midweek/${meetingId}/assignments/${parts[1]}`;
				field = parts[2];
			} else {
				id = `${parts[0]}:${meetingId}`;
				url = `/api/${meetingType.get(meetingId) === "weekend" ? "weekend" : "midweek"}/${meetingId}`;
				field = parts[1];
			}
			const req = requests.get(id) ?? { url, body: {}, keys: [] };
			req.body[field] = value;
			req.keys.push(key);
			requests.set(id, req);
		}

		const remaining: Drafts = {};
		const failed: Record<string, string> = {};
		await mapWithLimit([...requests.values()], 6, async (req) => {
			let reason: string | null = null;
			try {
				const res = await fetch(req.url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string } | null;
					reason =
						res.status === 404
							? "Ya no existe; recarga el mes."
							: res.status === 403 && body?.error
								? body.error
								: res.status === 401
									? "La sesión se cerró; vuelve a entrar."
									: "No se pudo guardar.";
				}
			} catch {
				reason = "Sin conexión: no se guardó.";
			}
			if (reason) {
				for (const k of req.keys) {
					remaining[k] = drafts[k];
					failed[k] = reason;
				}
			}
		});
		setDrafts(remaining);
		setErrors(failed);
		const nFailed = Object.keys(failed).length;
		setMessage(nFailed ? `No se guardaron ${nFailed} (marcadas en rojo). Lo demás sí quedó guardado.` : "Guardado.");
		setSaving(false);
		await load();
	}

	const assign = (meetingId: string, cell: PlannerCell, value: string | null) => {
		const key = `${meetingId}|${cell.target}`;
		setErrors((e) => {
			if (!(key in e)) return e;
			const next = { ...e };
			delete next[key];
			return next;
		});
		setDrafts((d) => {
			const next = { ...d };
			if (value === cell.value) delete next[key];
			else next[key] = value;
			return next;
		});
	};

	let lastGroup: string | undefined;
	const body = (
		<div className="fixed inset-0 z-[70] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`${TITLES[module]}: vista mensual`}>
			<header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-5">
				<h2 className="mr-1 font-display text-lg font-medium text-ink sm:text-xl">{TITLES[module]}</h2>
				<div className="flex items-center gap-1 rounded-full bg-surface-alt p-1">
					<button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface">
						<ChevronLeft size={18} />
					</button>
					<span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-ink">{data?.label ?? "…"}</span>
					<button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface">
						<ChevronRight size={18} />
					</button>
				</div>
				{message && <span className={`text-xs ${Object.keys(errors).length ? "text-red-600" : "text-ink-soft"}`}>{message}</span>}
				<div className="ml-auto flex items-center gap-2">
					<Button onClick={save} disabled={!dirty || saving}>
						<Save size={16} />
						{saving ? "Guardando..." : dirty ? `Guardar (${Object.keys(drafts).length})` : "Guardar"}
					</Button>
					<IconButton label="Cerrar la vista mensual" icon={X} onClick={close} />
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-auto">
				{loadError ? (
					<p className="p-5 text-sm text-red-600">{loadError}</p>
				) : !data || (loading && !data) ? (
					<div className="flex h-full items-center justify-center">
						<Spinner />
					</div>
				) : data.columns.length === 0 ? (
					<p className="p-5 text-sm text-ink-soft">No hay reuniones en este mes.</p>
				) : (
					<table className={`border-separate border-spacing-0 text-sm ${loading ? "opacity-60" : ""}`}>
						<thead>
							<tr>
								<th className="sticky left-0 top-0 z-30 min-w-[11rem] border-b border-r border-line bg-surface px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft sm:min-w-[14rem]">
									Asignación
								</th>
								{data.columns.map((col) => (
									<th
										key={col.meetingId}
										className={`sticky top-0 z-20 min-w-[10.5rem] border-b border-line bg-surface px-2 py-2 text-left font-semibold ${col.cancelled ? "text-ink-soft" : "text-ink"}`}
									>
										{module === "operational" && (
											<span className="block text-[11px] font-medium uppercase tracking-wide text-ink-soft">
												{col.meetingType === "midweek" ? "Entre semana" : "Fin de semana"}
											</span>
										)}
										<span className="capitalize">{shortDate(col.date)}</span>
										{col.cancelled && <span className="block text-xs font-normal">Cancelada</span>}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{data.rows.flatMap((row) => {
								const out = [];
								if (row.group && row.group !== lastGroup) {
									out.push(
										<tr key={`g:${row.group}`}>
											<td colSpan={data.columns.length + 1} className="sticky left-0 bg-bg px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-accent">
												{row.group}
											</td>
										</tr>,
									);
								}
								lastGroup = row.group ?? lastGroup;
								out.push(
									<tr key={row.key}>
										<th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-1.5 text-left font-medium text-ink">
											{row.label}
										</th>
										{data.columns.map((col) => {
											const cell = data.cells[row.key]?.[col.meetingId];
											return (
												<td key={col.meetingId} className="border-b border-line px-1.5 py-1 align-top">
													{cell ? (
														<CellEditor
															cell={cell}
															disabled={col.cancelled || saving}
															value={cell.target ? shown(col.meetingId, cell) : null}
															changed={`${col.meetingId}|${cell.target}` in drafts}
															error={errors[`${col.meetingId}|${cell.target}`]}
															repeated={(() => {
																const v = cell.target ? shown(col.meetingId, cell) : null;
																return !!v && repeated.has(`${col.meetingId}|${v}`);
															})()}
															options={cell.privilegeId ? (data.eligible[cell.privilegeId] ?? []) : []}
															names={data.names}
															onChange={(v) => assign(col.meetingId, cell, v)}
														/>
													) : (
														<span className="block px-2 text-ink-soft">—</span>
													)}
												</td>
											);
										})}
									</tr>,
								);
								return out;
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);

	return typeof document === "undefined" ? null : createPortal(body, document.body);
}

function CellEditor({
	cell,
	value,
	disabled,
	changed,
	error,
	repeated,
	options,
	names,
	onChange,
}: {
	cell: PlannerCell;
	value: string | null;
	disabled: boolean;
	changed: boolean;
	error?: string;
	repeated: boolean;
	options: { id: string; name: string; gender: "male" | "female" }[];
	names: Record<string, string>;
	onChange: (value: string | null) => void;
}) {
	if (cell.readOnly !== undefined && cell.readOnly !== null) {
		return <span className="block px-2 py-1 text-ink-soft">{cell.readOnly}</span>;
	}
	const list = cell.maleOnly ? options.filter((o) => o.gender === "male") : options;
	const missing = value && !list.some((o) => o.id === value);
	const tone = error
		? "border-red-500 ring-1 ring-red-500"
		: changed
			? "border-accent ring-1 ring-accent"
			: repeated
				? "border-amber-500"
				: "border-line";
	return (
		<div title={error ?? (repeated ? "Esta persona ya tiene otra asignación en esta reunión." : (cell.title ?? undefined))}>
			{cell.title && <span className="block truncate px-1 text-[11px] leading-tight text-ink-soft">{cell.title}</span>}
			<select
				value={value ?? ""}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value || null)}
				className={`w-full rounded-lg border bg-surface px-1.5 py-1.5 text-sm text-ink disabled:opacity-50 ${tone}`}
			>
				<option value="">—</option>
				{missing && <option value={value}>{names[value] ?? "Otra persona"}</option>}
				{list.map((o) => (
					<option key={o.id} value={o.id}>
						{o.name}
					</option>
				))}
			</select>
		</div>
	);
}
