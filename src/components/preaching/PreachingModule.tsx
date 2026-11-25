"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, House, Map as MapIcon, MapPin, Pencil, Plus, Repeat, Send, Trash2, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Chip, ChipGroup, Fab, IconButton, List, PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { WhatsAppPreachingButtons } from "@/components/preaching/WhatsAppPreaching";
import { DayCaptainsButton } from "@/components/preaching/DayCaptains";
import { TerritoryMapViewer } from "@/components/territories/TerritoryMapViewer";
import { formatLongDate, formatShortDate } from "@/lib/dateFormat";
import { TERRITORY_KIND_LABEL, departureText, type Departure, type TerritoryKind } from "@/lib/territories/geo";

interface SessionRow {
	id: string;
	date: string;
	time: string;
	note: string | null;
	kind: TerritoryKind;
	recurring: boolean;
	/** Flujo 2: el capitán de la salida (null = flujo 1). */
	captainUserId?: string | null;
	notifiedAt: string | null;
	territories: {
		id: string;
		number: string;
		name: string | null;
		meetingPlace: string | null;
		hasMap: boolean;
		departureFid: string | null;
		departure: Departure | null;
		departures: Departure[];
	}[];
	targets: { congregation: boolean; groups: { id: string; name: string; color: string | null }[]; users: { id: string; fullName: string }[] };
}

interface Options {
	territories: { id: string; number: string; name: string | null; kind: TerritoryKind; assigneeName: string; departures: Departure[] }[];
	groups: { id: string; name: string; color: string | null }[];
	people: { id: string; fullName: string }[];
	defaultTime?: string;
	/** Flujo 2 («capitán fijo por día»). */
	captains: { weekday: number; kind: TerritoryKind; userId: string; fullName: string }[];
	allTerritories: { id: string; number: string; name: string | null; kind: TerritoryKind; assigneeName: string | null; assigneeUserId: string | null; departures: Departure[] }[];
	captainCandidates: Record<TerritoryKind, { id: string; fullName: string }[]>;
}

/** Día de la semana de una fecha AAAA-MM-DD: 1 = lunes … 7 = domingo (igual que lib/preaching/captains.ts). */
function weekdayOf(date: string): number {
	const day = new Date(`${date}T12:00:00Z`).getUTCDay();
	return day === 0 ? 7 : day;
}

const ERRORS: Record<string, string> = {
	invalid_date: "Elige una fecha válida.",
	invalid_time: "Elige una hora válida.",
	no_territories: "Elige al menos un territorio.",
	territory_not_assigned: "Solo se pueden usar territorios que ya estén asignados.",
	mixed_kinds: "Los territorios de una misma salida deben ser del mismo tipo.",
	invalid_targets: "Revisa a quién se asigna: territorios generales → toda la congregación o grupos; predicación pública → publicadores.",
	invalid_departure: "El punto de salida elegido ya no existe en el mapa del territorio.",
	captain_invalid: "El capitán no puede recibir territorios de ese tipo (le falta el privilegio «Asignable…»).",
};

function time12(value: string): string {
	const [h, m] = value.split(":").map(Number);
	return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** Hora compacta para las celdas del calendario: 9:00a, 6:30p. */
function timeShort(value: string): string {
	const [h, m] = value.split(":").map(Number);
	return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
}

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today(): string {
	return isoDate(new Date());
}

function targetsText(s: SessionRow): string {
	if (s.targets.congregation) return "Toda la congregación";
	if (s.targets.groups.length > 0) return `Grupos: ${s.targets.groups.map((g) => g.name).join(", ")}`;
	const names = s.targets.users.map((u) => u.fullName);
	return `Publicadores: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` y ${names.length - 4} más` : ""}`;
}

/** Ícono de una salida: casita (general, toda la congregación), grupo (general, grupos) o pin (predicación pública). */
function kindIcon(s: SessionRow): { Icon: LucideIcon; label: string } {
	if (s.kind === "public_preaching") return { Icon: MapPin, label: "Predicación pública" };
	if (s.targets.congregation) return { Icon: House, label: "General · toda la congregación" };
	return { Icon: Users, label: "General · grupos" };
}

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

type View = "month" | "upcoming" | "past" | "all";
type FormState = { session: SessionRow | null; date?: string } | null;

/** Predicación: salidas con fecha, hora y nota sobre territorios ya asignados, dirigidas a toda la congregación o a grupos
 * (territorios generales) o a varios publicadores (predicación pública). Al guardar se genera el aviso y el push. */
export function PreachingModule() {
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [view, setView] = useState<View>("month");
	const [message, setMessage] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(null);
	const [monthCursor, setMonthCursor] = useState(() => {
		const d = new Date();
		return { year: d.getFullYear(), month: d.getMonth() };
	});
	const [dayModal, setDayModal] = useState<string | null>(null);
	// Tipos de territorio cuyo mapa puede abrir quien consulta, y el mapa abierto.
	const [mapKinds, setMapKinds] = useState<TerritoryKind[]>([]);
	const [mapFor, setMapFor] = useState<string | null>(null);

	const load = useCallback(async () => {
		const response = await fetch("/api/preaching");
		if (response.ok) {
			const body = (await response.json()) as { items: SessionRow[]; mapKinds?: TerritoryKind[] };
			setSessions(body.items);
			setMapKinds(body.mapKinds ?? []);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const visible = useMemo(() => {
		const now = today();
		const list = sessions.filter((s) => (view === "all" ? true : view === "upcoming" ? s.date >= now : s.date < now));
		// Próximas: la más cercana primero; pasadas: la más reciente primero.
		return [...list].sort((a, b) => (view === "upcoming" ? `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) : `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)));
	}, [sessions, view]);

	async function run(id: string, request: () => Promise<Response>, ok: string) {
		setBusyId(id);
		setMessage(null);
		const response = await request();
		setBusyId(null);
		setMessage(response.ok ? ok : "No se pudo completar la acción.");
		if (response.ok) await load();
	}

	function remove(s: SessionRow) {
		if (!window.confirm(`¿Eliminar la predicación del ${formatShortDate(s.date)}? Se borran también sus avisos.`)) return;
		run(s.id, () => fetch(`/api/preaching/${s.id}`, { method: "DELETE" }), "Predicación eliminada.");
	}

	function sessionActions(s: SessionRow) {
		const busy = busyId === s.id;
		const maps = mapKinds.includes(s.kind) ? s.territories.filter((t) => t.hasMap) : [];
		return (
			<>
				{maps.map((t) => (
					<IconButton
						key={t.id}
						label={maps.length > 1 ? `Ver mapa: ${t.name || `Territorio ${t.number}`}` : "Ver mapa"}
						icon={MapIcon}
						tone="accent"
						onClick={() => setMapFor(t.id)}
					/>
				))}
				<IconButton
					label="Reenviar aviso"
					icon={Send}
					disabled={busy}
					onClick={() => run(s.id, () => fetch(`/api/preaching/${s.id}`, { method: "POST" }), "Aviso reenviado.")}
				/>
				<IconButton
					label="Editar"
					icon={Pencil}
					disabled={busy}
					onClick={() => {
						setDayModal(null);
						setForm({ session: s });
					}}
				/>
				<IconButton label="Eliminar" icon={Trash2} tone="danger" disabled={busy} onClick={() => remove(s)} />
			</>
		);
	}

	const daySessions = dayModal ? sessions.filter((s) => s.date === dayModal).sort((a, b) => a.time.localeCompare(b.time)) : [];

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Predicación" subtitle="Salidas a predicar sobre territorios ya asignados" actions={<><DayCaptainsButton /><WhatsAppPreachingButtons /></>} />

			<ChipGroup>
				{(
					[
						["month", "Mes"],
						["upcoming", "Próximas"],
						["past", "Pasadas"],
						["all", "Todas"],
					] as [View, string][]
				).map(([value, label]) => (
					<Chip key={value} active={view === value} onClick={() => setView(value)}>
						{label}
					</Chip>
				))}
			</ChipGroup>

			{message && <p className="px-1 text-sm text-ink-soft">{message}</p>}

			{loading ? (
				<PageLoader />
			) : view === "month" ? (
				<MonthCalendar
					sessions={sessions}
					cursor={monthCursor}
					onCursor={setMonthCursor}
					onDay={(date, has) => (has ? setDayModal(date) : setForm({ session: null, date }))}
				/>
			) : visible.length === 0 ? (
				<Card>
					<p className="text-sm text-ink-soft">
						{sessions.length === 0 ? "Todavía no hay predicaciones. Crea una con el botón «Nueva predicación»." : "No hay predicaciones en esta vista."}
					</p>
				</Card>
			) : (
				<List>
					{visible.map((s) => (
						<div key={s.id} className="py-3 pl-4 pr-1">
							<div className="flex items-baseline justify-between gap-2 pr-3">
								<span className="text-base font-semibold text-ink">{formatLongDate(s.date)}</span>
								<span className="shrink-0 text-sm font-semibold text-accent">{time12(s.time)}</span>
							</div>
							<SessionBody s={s} />
							<div className="mt-1 flex items-center justify-end">
								<span className="mr-auto text-xs text-ink-soft">{s.notifiedAt ? `Avisado ${formatShortDate(s.notifiedAt)}` : "Sin avisar"}</span>
								{sessionActions(s)}
							</div>
						</div>
					))}
				</List>
			)}

			<Fab label="Nueva predicación" icon={Plus} onClick={() => setForm({ session: null })} />

			{dayModal && (
				<Modal open onClose={() => setDayModal(null)} title={formatLongDate(dayModal)}>
					<div className="flex flex-col gap-4">
						{daySessions.map((s) => {
							const { Icon, label } = kindIcon(s);
							return (
								<div key={s.id} className="rounded-2xl border border-border p-3">
									<div className="flex items-center gap-2">
										<Icon size={18} className="shrink-0 text-accent" aria-label={label} />
										<span className="text-base font-semibold text-ink">{time12(s.time)}</span>
									</div>
									<SessionBody s={s} />
									<div className="mt-1 flex items-center justify-end">{sessionActions(s)}</div>
								</div>
							);
						})}
						<Button
							variant="secondary"
							onClick={() => {
								const date = dayModal;
								setDayModal(null);
								setForm({ session: null, date });
							}}
						>
							<Plus size={16} />
							Agregar predicación este día
						</Button>
					</div>
				</Modal>
			)}

			{mapFor && <TerritoryMapViewer territoryId={mapFor} onClose={() => setMapFor(null)} />}

			{form && (
				<SessionForm
					session={form.session}
					initialDate={form.date}
					onClose={() => setForm(null)}
					onSaved={async () => {
						setForm(null);
						setMessage("Guardado. Se generó el aviso y se envió el push.");
						await load();
					}}
				/>
			)}
		</div>
	);
}

function SessionBody({ s }: { s: SessionRow }) {
	return (
		<>
			<div className="mt-1 flex flex-wrap gap-1.5 pr-3">
				{s.territories.map((t) => (
					<span key={t.id} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
						{t.name || `Territorio ${t.number}`}
					</span>
				))}
			</div>
			<div className="mt-1 pr-3 text-[13px] text-ink-soft">
				{targetsText(s)}
				{s.recurring && (
					<span className="ml-1.5 inline-flex items-center gap-1 font-medium text-accent-strong" title="Se repite cada semana hasta que el territorio se entregue">
						<Repeat size={12} />
						Recurrente
					</span>
				)}
			</div>
			{/* Punto de salida de ese día y las indicaciones de cada territorio. */}
			{s.territories.map((t) =>
				t.departure || t.meetingPlace ? (
					<div key={t.id} className="mt-1 pr-3 text-[13px] text-ink">
						{t.departure && (
							<div className="flex items-start gap-1.5 font-medium">
								<MapPin size={14} className="mt-0.5 shrink-0 text-green-600" />
								<span>
									{s.territories.length > 1 ? `${t.number}: ` : ""}
									{departureText(t.departure)}
								</span>
							</div>
						)}
						{t.meetingPlace && <div className="whitespace-pre-line text-ink-soft">{t.meetingPlace}</div>}
					</div>
				) : null,
			)}
			{s.note && <div className="mt-1 pr-3 text-[13px] text-ink">{s.note}</div>}
		</>
	);
}

/** Calendario del mes: los días con predicación se resaltan y muestran ícono + hora (hasta 2; con más, «Varios»). Un día sin
 * predicación abre el formulario con esa fecha. */
function MonthCalendar({
	sessions,
	cursor,
	onCursor,
	onDay,
}: {
	sessions: SessionRow[];
	cursor: { year: number; month: number };
	onCursor: (c: { year: number; month: number }) => void;
	onDay: (date: string, hasSessions: boolean) => void;
}) {
	const first = new Date(cursor.year, cursor.month, 1);
	const offset = (first.getDay() + 6) % 7; // lunes primero
	const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
	const cells: (string | null)[] = [
		...Array.from({ length: offset }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => isoDate(new Date(cursor.year, cursor.month, i + 1))),
	];
	while (cells.length % 7 !== 0) cells.push(null);
	const byDate = useMemo(() => {
		const map = new Map<string, SessionRow[]>();
		for (const s of sessions) map.set(s.date, [...(map.get(s.date) ?? []), s].sort((a, b) => a.time.localeCompare(b.time)));
		return map;
	}, [sessions]);
	const now = today();
	const shift = (delta: number) => {
		const d = new Date(cursor.year, cursor.month + delta, 1);
		onCursor({ year: d.getFullYear(), month: d.getMonth() });
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between rounded-full bg-surface p-1">
				<button type="button" onClick={() => shift(-1)} aria-label="Mes anterior" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-alt">
					<ChevronLeft size={20} />
				</button>
				<p className="text-[15px] font-semibold text-ink">
					{MONTHS[cursor.month]} {cursor.year}
				</p>
				<button type="button" onClick={() => shift(1)} aria-label="Mes siguiente" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-alt">
					<ChevronRight size={20} />
				</button>
			</div>

			<div className="grid grid-cols-7 gap-1 sm:gap-1.5">
				{WEEKDAYS.map((d) => (
					<div key={d} className="py-1 text-center text-xs font-semibold text-ink-soft">
						{d}
					</div>
				))}
				{cells.map((date, i) => {
					if (!date) return <div key={`e${i}`} />;
					const list = byDate.get(date) ?? [];
					const has = list.length > 0;
					const isToday = date === now;
					return (
						<button
							key={date}
							type="button"
							onClick={() => onDay(date, has)}
							aria-label={has ? `${formatLongDate(date)}: ${list.length} predicación(es)` : `${formatLongDate(date)}: agregar predicación`}
							className={`flex min-h-[4.5rem] flex-col items-stretch gap-0.5 rounded-xl border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 ${
								has ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-alt"
							} ${isToday ? "ring-2 ring-accent/60" : ""}`}
						>
							<span className={`text-xs font-semibold ${isToday ? "text-accent" : "text-ink"}`}>{Number(date.slice(8))}</span>
							{list.length <= 2 ? (
								list.map((s) => {
									const { Icon, label } = kindIcon(s);
									return (
										<span key={s.id} title={`${label} · ${time12(s.time)} · ${s.territories.map((t) => t.number).join(", ")}`} className="flex items-center gap-1 text-[11px] font-semibold leading-tight text-accent-strong">
											<Icon size={13} className="shrink-0" aria-hidden="true" />
											{timeShort(s.time)}
										</span>
									);
								})
							) : (
								<span
									title={list.map((s) => `${kindIcon(s).label} · ${time12(s.time)}`).join("\n")}
									className="rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-accent-ink"
								>
									Varios
								</span>
							)}
						</button>
					);
				})}
			</div>
			<p className="px-1 text-xs text-ink-soft">
				Toca un día con predicación para ver el detalle, o un día vacío para agregar una.
			</p>
		</div>
	);
}

function SessionForm({ session, initialDate, onClose, onSaved }: { session: SessionRow | null; initialDate?: string; onClose: () => void; onSaved: () => void }) {
	const [options, setOptions] = useState<Options | null>(null);
	const [date, setDate] = useState(session?.date ?? initialDate ?? today());
	const [time, setTime] = useState(session?.time ?? "");
	const [note, setNote] = useState(session?.note ?? "");
	const [recurring, setRecurring] = useState(session?.recurring ?? false);
	const [territoryIds, setTerritoryIds] = useState<string[]>(session?.territories.map((t) => t.id) ?? []);
	// Punto de salida elegido por territorio (null = el predeterminado).
	const [departures, setDepartures] = useState<Record<string, string | null>>(
		Object.fromEntries((session?.territories ?? []).map((t) => [t.id, t.departureFid])),
	);
	const [congregation, setCongregation] = useState(session?.targets.congregation ?? true);
	const [groupIds, setGroupIds] = useState<string[]>(session?.targets.groups.map((g) => g.id) ?? []);
	const [userIds, setUserIds] = useState<string[]>(session?.targets.users.map((u) => u.id) ?? []);
	const [search, setSearch] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Flujo 2: «tipo|persona» del capitán de la salida; "" = flujo 1 (el territorio ya viene asignado). `undefined` = aún sin elegir:
	// se toma el capitán fijo del día, si lo hay.
	const [captain, setCaptain] = useState<string | undefined>(session ? (session.captainUserId ? `${session.kind}|${session.captainUserId}` : "") : undefined);

	useEffect(() => {
		fetch("/api/preaching/options")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				setOptions(data as Options | null);
				// Una predicación nueva empieza con el horario de predicación de la congregación.
				if (!session) setTime((t) => t || (data as Options | null)?.defaultTime || "09:00");
			});
	}, [session]);

	// Flujo 2: capitanes fijos de ese día. Una salida nueva en un día con capitán fijo empieza con el primero.
	const dayCaptains = useMemo(() => (options?.captains ?? []).filter((c) => c.weekday === weekdayOf(date)), [options, date]);
	const captainValue = captain ?? (dayCaptains[0] ? `${dayCaptains[0].kind}|${dayCaptains[0].userId}` : "");
	const [captainKind, captainUserId] = captainValue ? (captainValue.split("|") as [TerritoryKind, string]) : [null, null];
	const flow2 = !!captainUserId;

	// El tipo lo marca el capitán (flujo 2) o el primer territorio elegido (flujo 1): los demás deben ser del mismo tipo.
	const kind: TerritoryKind | null = useMemo(() => {
		if (captainKind) return captainKind;
		const first = options?.territories.find((t) => territoryIds.includes(t.id));
		return first?.kind ?? null;
	}, [options, territoryIds, captainKind]);

	// Flujo 2: todos los territorios de ese tipo; primero el suyo, luego los libres; los de otra persona dicen de quién son (al guardar,
	// pasan al capitán).
	const flow2Territories = useMemo(() => {
		if (!flow2) return [];
		const rank = (t: Options["allTerritories"][number]) => (t.assigneeUserId === captainUserId ? 0 : t.assigneeUserId ? 2 : 1);
		return (options?.allTerritories ?? [])
			.filter((t) => t.kind === captainKind)
			.sort((a, b) => rank(a) - rank(b) || a.number.localeCompare(b.number, undefined, { numeric: true }));
	}, [options, flow2, captainKind, captainUserId]);

	// Una salida editada puede tener un territorio cuya asignación ya terminó: se muestra igual para poder quitarlo.
	const territoryList = useMemo(() => {
		const list = [...(options?.territories ?? [])];
		for (const t of session?.territories ?? []) {
			if (!list.some((x) => x.id === t.id))
				list.push({ id: t.id, number: t.number, name: t.name, kind: session!.kind, assigneeName: "sin asignación vigente", departures: t.departures });
		}
		return list.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
	}, [options, session]);

	function toggle<T>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
	}

	const people = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (options?.people ?? []).filter((p) => !q || p.fullName.toLowerCase().includes(q));
	}, [options, search]);

	async function save() {
		setSaving(true);
		setError(null);
		const body = {
			date,
			time,
			note: note.trim() || null,
			recurring,
			territoryIds,
			departures: Object.fromEntries(territoryIds.map((id) => [id, departures[id] ?? null])),
			targets:
				kind === "public_preaching"
					? { congregation: false, groupIds: [], userIds }
					: { congregation, groupIds: congregation ? [] : groupIds, userIds: [] },
			captainUserId: flow2 ? captainUserId : null,
		};
		const response = await fetch(session ? `/api/preaching/${session.id}` : "/api/preaching", {
			method: session ? "PATCH" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setSaving(false);
		if (!response.ok) {
			const data = (await response.json().catch(() => ({}))) as { error?: string };
			setError(ERRORS[data.error ?? ""] ?? "No se pudo guardar. Revisa los datos e inténtalo de nuevo.");
			return;
		}
		onSaved();
	}

	const canSave =
		!!date &&
		!!time &&
		territoryIds.length > 0 &&
		(kind === "public_preaching" ? userIds.length > 0 : congregation || groupIds.length > 0);

	return (
		<Modal open onClose={onClose} title={session ? "Editar predicación" : "Nueva predicación"}>
			{!options ? (
				<PageLoader />
			) : (
				<div className="flex flex-col gap-4">
					<div className="grid grid-cols-2 gap-3">
						<Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
						<Input label="Hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
					</div>

					{(dayCaptains.length > 0 || flow2) && (
						<label className="flex flex-col gap-1.5">
							<span className="text-sm font-medium text-ink">Capitán</span>
							<select
								value={captainValue}
								onChange={(e) => {
									setCaptain(e.target.value);
									setTerritoryIds([]);
								}}
								className="min-h-12 rounded-2xl border border-border bg-surface px-3 text-base text-ink sm:text-sm"
							>
								{dayCaptains.length > 0 && (
									<optgroup label="Capitán fijo de este día">
										{dayCaptains.map((c) => (
											<option key={`${c.kind}|${c.userId}`} value={`${c.kind}|${c.userId}`}>
												{c.fullName} · {TERRITORY_KIND_LABEL[c.kind]}
											</option>
										))}
									</optgroup>
								)}
								{(["general", "public_preaching"] as const).map((k) => (
									<optgroup key={k} label={`Suplente · ${TERRITORY_KIND_LABEL[k]}`}>
										{(options.captainCandidates[k] ?? [])
											.filter((u) => !dayCaptains.some((c) => c.kind === k && c.userId === u.id))
											.map((u) => (
												<option key={`${k}|${u.id}`} value={`${k}|${u.id}`}>
													{u.fullName}
												</option>
											))}
									</optgroup>
								))}
								<option value="">Sin capitán fijo (territorio ya asignado)</option>
							</select>
							<span className="text-xs text-ink-soft">
								{flow2
									? "Elige solo el territorio: al guardar se le asigna al capitán y se devuelven los que tenía."
									: "Se usan los territorios que ya están asignados."}
							</span>
						</label>
					)}

					{flow2 && (
						<div className="flex flex-col gap-1.5">
							<span className="text-sm font-medium text-ink">Territorio</span>
							<div className="flex max-h-56 flex-col overflow-y-auto rounded-2xl border border-border">
								{flow2Territories.map((t) => (
									<label key={t.id} className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
										<input
											type="radio"
											name="flow2-territory"
											className="mt-1 h-5 w-5 shrink-0 accent-accent"
											checked={territoryIds[0] === t.id}
											onChange={() => setTerritoryIds([t.id])}
										/>
										<span className="min-w-0 text-sm text-ink">
											<span className="font-semibold">
												{t.number}
												{t.name ? ` — ${t.name}` : ""}
											</span>
											<span className="block text-xs text-ink-soft">
												{t.assigneeUserId === captainUserId ? "Ya es suyo" : t.assigneeName ? `Asignado a ${t.assigneeName}` : "Libre"}
											</span>
										</span>
									</label>
								))}
								{flow2Territories.length === 0 && <p className="px-3 py-2 text-sm text-ink-soft">No hay territorios de este tipo.</p>}
							</div>
						</div>
					)}

					{!flow2 && (
					<div className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-ink">Territorios (ya asignados)</span>
						{territoryList.length === 0 ? (
							<p className="text-sm text-ink-soft">No hay territorios asignados. Asigna uno primero en el módulo Territorios.</p>
						) : (
							<div className="flex max-h-56 flex-col overflow-y-auto rounded-2xl border border-border">
								{territoryList.map((t) => {
									const disabled = kind !== null && t.kind !== kind && !territoryIds.includes(t.id);
									return (
										<label key={t.id} className={`flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${disabled ? "opacity-40" : ""}`}>
											<input
												type="checkbox"
												className="mt-1 h-5 w-5 shrink-0 accent-accent"
												checked={territoryIds.includes(t.id)}
												disabled={disabled}
												onChange={() => setTerritoryIds((ids) => toggle(ids, t.id))}
											/>
											<span className="min-w-0 text-sm text-ink">
												<span className="font-semibold">
													{t.number}
													{t.name ? ` — ${t.name}` : ""}
												</span>
												<span className="block text-xs text-ink-soft">
													{TERRITORY_KIND_LABEL[t.kind]} · {t.assigneeName}
												</span>
											</span>
										</label>
									);
								})}
							</div>
						)}
						<p className="text-xs text-ink-soft">Puedes elegir varios del mismo tipo para el mismo día.</p>
					</div>
					)}

					{/* Punto de salida de cada territorio elegido que tenga más de uno en su mapa. */}
					{(flow2 ? flow2Territories : territoryList)
						.filter((t) => territoryIds.includes(t.id) && t.departures.length > 1)
						.map((t) => (
							<label key={t.id} className="flex flex-col gap-1.5">
								<span className="text-sm font-medium text-ink">Punto de salida · {t.name || `Territorio ${t.number}`}</span>
								<select
									value={departures[t.id] && departures[t.id] !== t.departures.find((d) => d.isDefault)?.fid ? (departures[t.id] as string) : ""}
									onChange={(e) => setDepartures((d) => ({ ...d, [t.id]: e.target.value || null }))}
									className="min-h-12 rounded-2xl border border-border bg-surface px-3 text-base text-ink sm:text-sm"
								>
									<option value="">Predeterminado ({departureText(t.departures.find((d) => d.isDefault) ?? t.departures[0])})</option>
									{t.departures
										.filter((d) => !d.isDefault)
										.map((d) => (
											<option key={d.fid} value={d.fid}>
												{departureText(d)}
											</option>
										))}
								</select>
							</label>
						))}

					{kind === null && <p className="text-sm text-ink-soft">Elige un territorio para ver a quién se puede asignar.</p>}

					{kind === "general" && (
						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium text-ink">Asignar a</span>
							<label className="flex items-center gap-3 text-sm text-ink">
								<input type="radio" className="h-5 w-5 accent-accent" checked={congregation} onChange={() => setCongregation(true)} />
								Toda la congregación
							</label>
							<label className="flex items-center gap-3 text-sm text-ink">
								<input type="radio" className="h-5 w-5 accent-accent" checked={!congregation} onChange={() => setCongregation(false)} />
								Uno o varios grupos de servicio
							</label>
							{!congregation && (
								<div className="ml-8 flex flex-col gap-1.5">
									{options.groups.length === 0 && <p className="text-sm text-ink-soft">No hay grupos de servicio activos.</p>}
									{options.groups.map((g) => (
										<label key={g.id} className="flex items-center gap-3 text-sm text-ink">
											<input type="checkbox" className="h-5 w-5 accent-accent" checked={groupIds.includes(g.id)} onChange={() => setGroupIds((ids) => toggle(ids, g.id))} />
											{g.name}
										</label>
									))}
								</div>
							)}
						</div>
					)}

					{kind === "public_preaching" && (
						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium text-ink">Publicadores ({userIds.length} elegidos)</span>
							<Input placeholder="Buscar por nombre" value={search} onChange={(e) => setSearch(e.target.value)} />
							<div className="flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-border">
								{people.map((p) => (
									<label key={p.id} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm text-ink last:border-b-0">
										<input type="checkbox" className="h-5 w-5 accent-accent" checked={userIds.includes(p.id)} onChange={() => setUserIds((ids) => toggle(ids, p.id))} />
										{p.fullName}
									</label>
								))}
								{people.length === 0 && <p className="px-3 py-2 text-sm text-ink-soft">Nadie coincide con la búsqueda.</p>}
							</div>
						</div>
					)}

					<label className="flex items-start gap-3 text-sm text-ink">
						<input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-accent" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
						<span>
							<span className="font-medium">Recurrente</span>
							<span className="block text-xs text-ink-soft">
								Se programa sola cada semana, el mismo día y a la misma hora, con el mismo capitán, hasta que el territorio se
								entregue.
							</span>
						</span>
					</label>

					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-ink">Nota (opcional)</span>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={500}
							rows={3}
							className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
						/>
					</label>

					{error && <p className="text-sm text-red-600">{error}</p>}
					<p className="text-xs text-ink-soft">Al guardar se genera un aviso en Mi Panel y se envía el push a quienes corresponde.</p>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={onClose}>
							Cancelar
						</Button>
						<Button onClick={save} disabled={!canSave || saving}>
							{saving ? "Guardando..." : "Guardar"}
						</Button>
					</div>
				</div>
			)}
		</Modal>
	);
}
