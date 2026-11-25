"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { IconButton, PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { InlineLoader } from "@/components/ui/Spinner";
import { CALENDAR_KIND_LABEL, type CalendarItem, type CalendarKind } from "@/lib/calendar/build";
import { formatLongDate, formatTime12h } from "@/lib/dateFormat";

type Kind = CalendarKind | "preaching";

/** Un color por tipo (iguales en la app). */
export const KIND_COLOR: Record<Kind, string> = {
	event: "#7C3AED",
	meeting: "#64748B",
	assignment: "#2563EB",
	preaching: "#16A34A",
	talk: "#0891B2",
	cleaning: "#D97706",
	pastoral: "#DB2777",
};

const KINDS: Kind[] = ["event", "meeting", "assignment", "preaching", "talk", "cleaning", "pastoral"];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

interface Departure {
	fid?: string;
	name: string;
	address: string | null;
	isDefault?: boolean;
}

interface PreachingSession {
	id: string;
	date: string;
	time: string;
	note: string | null;
	kind: "general" | "public_preaching";
	territories: {
		id: string;
		number: string;
		name: string | null;
		meetingPlace: string | null;
		departure: Departure | null;
		/** Puntos de salida del territorio y si quien consulta puede cambiar el de ese día (quien programa o el capitán, en plazo). */
		departures?: Departure[];
		canChangeDeparture?: boolean;
	}[];
	targets: { congregation: boolean; groups: { name: string }[]; users: { fullName: string }[] };
}

interface MonthData {
	items: CalendarItem[];
	preaching: PreachingSession[];
	canManage?: boolean;
}

/** Una entrada del día, ya sea de `items` o una salida de predicación. */
type Entry = { kind: Kind; time: string | null; title: string; item?: CalendarItem; session?: PreachingSession };

function iso(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
	return iso(d).slice(0, 7);
}

function territoryName(t: { number: string; name: string | null }): string {
	return t.name?.trim() || `Territorio ${t.number}`;
}

/** Calendario: todo lo que tiene fecha (eventos, reuniones, asignaciones, predicación, limpieza, discursos fuera, pastoreo), un color por
 * tipo; hoy resaltado. Al tocar un día se ve el detalle. Lo puede ver toda la congregación (cada quien, lo suyo). */
export function CalendarModule() {
	const [month, setMonth] = useState(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});
	const [data, setData] = useState<MonthData | null>(null);
	const [open, setOpen] = useState<string | null>(null);
	// Quien administra la predicación puede ver todas las salidas (por omisión, solo las que le tocan).
	const [all, setAll] = useState(false);
	const [canManage, setCanManage] = useState(false);
	const today = iso(new Date());

	// «?date=AAAA-MM-DD» (p. ej. al tocar una predicación en Mi Panel): abre ese mes y ese día.
	useEffect(() => {
		const date = new URLSearchParams(window.location.search).get("date");
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
		const [y, m] = date.split("-").map(Number);
		setMonth(new Date(y, m - 1, 1));
		setOpen(date);
	}, []);

	useEffect(() => {
		setData(null);
		fetch(`/api/calendar?month=${monthKey(month)}${all ? "&all=1" : ""}`)
			.then((r) => (r.ok ? (r.json() as Promise<MonthData>) : { items: [], preaching: [] }))
			.then((d) => {
				setData(d);
				if (d.canManage) setCanManage(true);
			})
			.catch(() => setData({ items: [], preaching: [] }));
	}, [month, all]);

	// Entradas por día (lo que dura varios días sale en cada uno).
	const byDay = useMemo(() => {
		const map = new Map<string, Entry[]>();
		if (!data) return map;
		const add = (day: string, e: Entry) => map.set(day, [...(map.get(day) ?? []), e]);
		for (const i of data.items) {
			const end = i.dateEnd ?? i.date;
			for (let d = new Date(`${i.date}T12:00:00`); iso(d) <= end; d.setDate(d.getDate() + 1)) {
				add(iso(d), { kind: i.kind, time: i.time ?? null, title: i.title, item: i });
			}
		}
		for (const s of data.preaching) {
			add(s.date, { kind: "preaching", time: s.time, title: `Predicación · ${s.territories.map(territoryName).join(", ")}`, session: s });
		}
		for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
		return map;
	}, [data]);

	const cells = useMemo(() => {
		const offset = (month.getDay() + 6) % 7; // lunes = 0
		const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
		const list: (string | null)[] = [...Array(offset).fill(null)];
		for (let d = 1; d <= days; d++) list.push(iso(new Date(month.getFullYear(), month.getMonth(), d)));
		while (list.length % 7) list.push(null);
		return list;
	}, [month]);

	const present = KINDS.filter((k) => [...byDay.values()].some((l) => l.some((e) => e.kind === k)));
	const rawLabel = month.toLocaleDateString("es", { month: "long", year: "numeric" });
	const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
	const isCurrentMonth = monthKey(month) === today.slice(0, 7);

	return (
		<div className="flex flex-col gap-4 pb-12">
			<PageHeader title="Calendario" subtitle="Eventos, reuniones, tus asignaciones y la predicación" />
			<div className="flex items-center gap-1">
				<IconButton label="Mes anterior" icon={ChevronLeft} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
				<p className="flex-1 text-center text-base font-semibold text-ink">{label}</p>
				{!isCurrentMonth && (
					<button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-full px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft">
						Hoy
					</button>
				)}
				<IconButton label="Mes siguiente" icon={ChevronRight} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
			</div>
			{canManage && (
				<div className="flex gap-1 self-start rounded-full bg-surface-alt p-1 text-[13px] font-semibold">
					{[
						{ value: false, label: "Solo las mías" },
						{ value: true, label: "Todas" },
					].map((o) => (
						<button
							key={o.label}
							type="button"
							aria-pressed={all === o.value}
							onClick={() => setAll(o.value)}
							className={`rounded-full px-3 py-1 transition-colors ${all === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
						>
							{o.label}
						</button>
					))}
				</div>
			)}

			{!data ? (
				<InlineLoader />
			) : (
				<>
					<div className="grid grid-cols-7 gap-1">
						{WEEKDAYS.map((d) => (
							<p key={d} className="text-center text-xs font-semibold text-ink-soft">
								{d}
							</p>
						))}
						{cells.map((day, i) => {
							if (!day) return <div key={`e${i}`} />;
							const list = byDay.get(day) ?? [];
							const isToday = day === today;
							return (
								<button
									key={day}
									type="button"
									disabled={list.length === 0}
									onClick={() => setOpen(day)}
									aria-label={`${formatLongDate(day)}${list.length ? `: ${list.length} ${list.length === 1 ? "cosa" : "cosas"}` : ""}`}
									className={`flex min-h-16 flex-col gap-0.5 overflow-hidden rounded-xl border p-1 text-left transition-colors sm:min-h-24 ${
										isToday ? "border-accent bg-accent-soft" : "border-border bg-surface"
									} ${list.length ? "hover:border-accent" : "cursor-default"}`}
								>
									<span
										className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-accent text-accent-ink" : "text-ink"}`}
									>
										{Number(day.slice(8))}
									</span>
									{/* En pantalla chica, puntos de color; en grande, las primeras con su título. */}
									<span className="flex flex-wrap gap-0.5 sm:hidden">
										{list.slice(0, 6).map((e, j) => (
											<span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[e.kind] }} />
										))}
									</span>
									<span className="hidden flex-col gap-0.5 sm:flex">
										{list.slice(0, 3).map((e, j) => (
											<span key={j} className="truncate rounded px-1 text-[11px] font-medium text-white" style={{ background: KIND_COLOR[e.kind] }}>
												{e.time ? `${formatTime12h(e.time)} ` : ""}
												{e.title}
											</span>
										))}
										{list.length > 3 && <span className="px-1 text-[11px] text-ink-soft">+{list.length - 3} más</span>}
									</span>
								</button>
							);
						})}
					</div>
					{present.length > 0 ? (
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
							{present.map((k) => (
								<span key={k} className="inline-flex items-center gap-1.5">
									<span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} /> {CALENDAR_KIND_LABEL[k]}
								</span>
							))}
						</div>
					) : (
						<p className="text-sm text-ink-soft">No hay nada en este mes.</p>
					)}
				</>
			)}

			{open && (
				<Modal open onClose={() => setOpen(null)} title={formatLongDate(open)}>
					<div className="flex flex-col gap-3">
						{(byDay.get(open) ?? []).map((e, i) => (
							<div key={i} className="border-l-4 pl-3" style={{ borderColor: KIND_COLOR[e.kind] }}>
								<p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR[e.kind] }}>
									{CALENDAR_KIND_LABEL[e.kind]}
									{e.time ? ` · ${formatTime12h(e.time)}` : ""}
								</p>
								{e.session ? <SessionDetail s={e.session} /> : <ItemDetail item={e.item!} />}
							</div>
						))}
					</div>
				</Modal>
			)}
		</div>
	);
}

function ItemDetail({ item }: { item: CalendarItem }) {
	return (
		<div className="text-sm text-ink">
			<p className="font-semibold">{item.title}</p>
			{item.dateEnd && (
				<p className="text-[13px] text-ink-soft">
					Del {formatLongDate(item.date)} al {formatLongDate(item.dateEnd)}
				</p>
			)}
			{item.detail && <p className="whitespace-pre-line text-[13px] text-ink-soft">{item.detail}</p>}
			{item.mapUrl && (
				<a href={item.mapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
					<ExternalLink size={14} /> Ver en el mapa
				</a>
			)}
		</div>
	);
}

function SessionDetail({ s }: { s: PreachingSession }) {
	const who = s.targets.congregation
		? "Toda la congregación"
		: s.targets.groups.length
			? `Grupos: ${s.targets.groups.map((g) => g.name).join(", ")}`
			: `Publicadores: ${s.targets.users.map((u) => u.fullName).join(", ")}`;
	return (
		<div className="flex flex-col gap-0.5 text-sm text-ink">
			<p className="font-semibold">
				{s.kind === "public_preaching" ? "Predicación pública" : "Predicación"} · {s.territories.map(territoryName).join(", ")}
			</p>
			<p className="text-[13px] text-ink-soft">{who}</p>
			{s.territories.map((t) => (
				<div key={t.id} className="text-[13px]">
					{t.canChangeDeparture && (t.departures?.length ?? 0) > 1 ? (
						<DepartureChanger sessionId={s.id} territory={t} label={s.territories.length > 1 ? territoryName(t) : null} />
					) : (
						t.departure && (
							<p>
								Salida{s.territories.length > 1 ? ` (${territoryName(t)})` : ""}: {departureLabel(t.departure)}
							</p>
						)
					)}
					{t.meetingPlace && <p className="whitespace-pre-line text-ink-soft">{t.meetingPlace}</p>}
				</div>
			))}
			{s.note && <p className="whitespace-pre-line text-[13px]">{s.note}</p>}
		</div>
	);
}

const departureLabel = (d: Departure) => (d.address ? `${d.name} — ${d.address}` : d.name);

/** Quien programa la predicación o el capitán del territorio cambia el punto de salida de ese día entre los del territorio (antes de
 * la salida o hasta 2 horas después; si ya se avisó, el servidor reenvía el aviso). */
function DepartureChanger({ sessionId, territory, label }: { sessionId: string; territory: PreachingSession["territories"][number]; label: string | null }) {
	const options = territory.departures ?? [];
	const [value, setValue] = useState(territory.departure?.fid ?? options.find((d) => d.isDefault)?.fid ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function change(fid: string) {
		const previous = value;
		setValue(fid);
		setBusy(true);
		setError(null);
		const response = await fetch(`/api/preaching/${sessionId}/departure`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ territoryId: territory.id, fid }),
		}).catch(() => null);
		setBusy(false);
		if (!response?.ok) {
			const body = (await response?.json().catch(() => null)) as { error?: string } | null;
			setValue(previous);
			setError(body?.error === "departure_locked" ? "Ya no se puede cambiar: pasaron más de 2 horas desde la salida." : "No se pudo cambiar el punto de salida.");
		}
	}

	const current = options.find((d) => d.fid === value);
	return (
		<label className="mt-1 flex flex-col gap-1">
			<span className="text-xs font-semibold text-ink-soft">Punto de salida{label ? ` · ${label}` : ""}</span>
			<select
				value={value}
				disabled={busy}
				onChange={(e) => change(e.target.value)}
				className="min-h-11 w-full max-w-md rounded-2xl border border-border bg-surface px-3 text-base text-ink disabled:opacity-60 sm:text-sm"
			>
				{options.map((d) => (
					<option key={d.fid} value={d.fid}>
						{d.name}
					</option>
				))}
			</select>
			{current?.address && <span className="text-ink-soft">{current.address}</span>}
			{error && <span className="text-xs text-red-600">{error}</span>}
		</label>
	);
}
