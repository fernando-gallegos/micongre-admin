"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, User, type LucideIcon } from "lucide-react";
import { SectionBar, type SectionIconName } from "./SectionIcon";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { InlineLoader } from "@/components/ui/Spinner";
import { formatLongDate, formatShortDate } from "@/lib/dateFormat";
import { addDays, formatWeekRangeEs, toISODate } from "@/lib/mwb/dates";
import { SECTION_LABELS } from "@/lib/rbac/roles";
import {
	canTimeMeeting,
	meetingWhen,
	midweekTimerPlan,
	weekendTimerPlan,
	type TimedItem,
	type TimerCoVisit,
	type TimerMidweekAssignment,
} from "@/lib/meetings/timer";
import { MeetingAttendanceButton, type AttendanceTarget } from "./MeetingAttendanceButton";
import { MeetingTimerFullPage, MeetingTimerOverlay, TimerLine, FLOAT_BOTTOM } from "./MeetingTimerUi";
import { MeetingTimerContext, useMeetingTimer, useTimer } from "./useMeetingTimer";

// --- Tipos de lo que devuelven las APIs (solo lo que se usa) ---

type MeetingType = "midweek" | "weekend";

interface MeetingEvent {
	name: string;
	startDate: string;
	endDate: string;
	action: "cancel" | "move";
	message: string | null;
}

interface Context {
	event: MeetingEvent | null;
	coVisit: TimerCoVisit | null;
	date: string | null;
	time: string | null;
}

interface MidweekAssignment extends TimerMidweekAssignment {
	description: string | null;
	partNumber: number | null;
	/** Abre la parte (numerada) en la guía de JW Library. */
	jwLink?: string | null;
	mainAssigneeName: string | null;
	assistantAssigneeName: string | null;
}

interface MidweekDetail extends Context {
	meeting: {
		id: string;
		meetingDate: string;
		weekLabel: string | null;
		status: string;
		hasAuxRoom: boolean;
		chairmanUserId: string | null;
		chairmanName: string | null;
		openingPrayerName: string | null;
		openingSongNumber: number | null;
		openingSongTitle: string | null;
		middleSongNumber: number | null;
		middleSongTitle: string | null;
		closingSongNumber: number | null;
		closingSongTitle: string | null;
	};
	assignments: MidweekAssignment[];
	skipOpeningPrayer: boolean;
}

interface WeekendMeeting {
	id: string;
	meetingDate: string;
	status: string;
	chairmanUserId: string | null;
	chairmanName: string | null;
	prayerName: string | null;
	speakerName: string | null;
	speakerCongregationName: string | null;
	talkOutlineNumber: number | null;
	talkOutlineTitle: string | null;
	talkSongNumber: number | null;
	talkSongTitle: string | null;
	watchtowerFirst: boolean;
	watchtowerTitle: string | null;
	/** Abre el artículo en JW Library. */
	watchtowerLink?: string | null;
	/** Abre el bosquejo (S-34) en JW Library: solo llega a ancianos y siervos ministeriales. */
	talkOutlineLink?: string | null;
	watchtowerConductorName: string | null;
	watchtowerReaderName: string | null;
	watchtowerSongNumber: number | null;
	watchtowerSongTitle: string | null;
	closingSongNumber: number | null;
	closingSongTitle: string | null;
	notes: string | null;
}

interface WeekendDetail extends Context {
	meeting: WeekendMeeting;
}

interface OperationalItem {
	id: string;
	privilegeId: string;
	privilegeName: string;
	position: string | null;
	assignedUserName: string | null;
}

interface Slot {
	day: string | null;
	time: string | null;
	cancelledBy: string | null;
}

interface Me {
	id: string;
	privilegeCodes: string[];
	appointmentTypes: string[];
}

type Loaded =
	| { type: "midweek"; detail: MidweekDetail; ops: OperationalItem[] }
	| { type: "weekend"; detail: WeekendDetail; ops: OperationalItem[] }
	| { type: "none" }
	| { type: "error" };

const TIMED_STATUSES = new Set(["scheduled", "adjusted_co_visit"]);

/** Lunes (ISO) de la semana de hoy, con la fecha local del navegador (no la de UTC). */
function thisMonday(): string {
	const now = new Date();
	const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const day = today.getUTCDay();
	return toISODate(addDays(today, day === 0 ? -6 : 1 - day));
}

function songText(number: number, title: string | null | undefined): string {
	return title ? `Canción ${number}: ${title}` : `Canción ${number}`;
}

function partHeading(a: TimerMidweekAssignment): string {
	if (a.sectionType === "living_custom") return a.sectionTitle || "Asignación";
	if (["treasures_talk", "christian_living", "student_assignment"].includes(a.sectionType) && a.sectionTitle) return a.sectionTitle;
	if (a.sectionType === "treasures_talk") return "Discurso";
	return SECTION_LABELS[a.sectionType] ?? a.sectionType;
}

async function getJson<T>(url: string): Promise<T> {
	const r = await fetch(url);
	if (!r.ok) throw new Error(String(r.status));
	return (await r.json()) as T;
}

/** Reuniones en solo lectura para toda la congregación (como la pantalla de Reuniones de la app Android). */
export function MeetingsProgram() {
	const [tab, setTab] = useState<MeetingType>("midweek");
	const [weekStart, setWeekStart] = useState<string>(() => thisMonday());
	const [schedule, setSchedule] = useState<{ midweek: Slot | null; weekend: Slot | null } | null>(null);
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [me, setMe] = useState<Me | null>(null);

	// Sábado o domingo abre Fin de semana; el resto de la semana, Entre semana. (Después de montar, para que servidor y cliente coincidan.)
	useEffect(() => {
		const d = new Date().getDay();
		if (d === 0 || d === 6) setTab("weekend");
		setWeekStart(thisMonday());
		getJson<Me>("/api/auth/me")
			.then((m) => setMe({ id: m.id, privilegeCodes: m.privilegeCodes ?? [], appointmentTypes: m.appointmentTypes ?? [] }))
			.catch(() => {});
	}, []);

	useEffect(() => {
		let cancelled = false;
		setSchedule(null);
		getJson<{ midweek: Slot | null; weekend: Slot | null }>(`/api/congregation/schedule?week=${weekStart}`)
			.then((s) => !cancelled && setSchedule(s))
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [weekStart]);

	useEffect(() => {
		let cancelled = false;
		setLoaded(null);
		const to = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));
		(async () => {
			const list = await getJson<{ items: { id: string }[] }>(`/api/${tab}?from=${weekStart}&to=${to}`);
			const meeting = list.items[0];
			if (!meeting) return { type: "none" } as Loaded;
			const [detail, ops] = await Promise.all([
				getJson<MidweekDetail | WeekendDetail>(`/api/${tab}/${meeting.id}`),
				getJson<{ items: OperationalItem[] }>(`/api/meetings/operational-view?meetingType=${tab}&meetingId=${meeting.id}`)
					.then((r) => r.items)
					.catch(() => []),
			]);
			return (tab === "midweek"
				? { type: "midweek", detail: detail as MidweekDetail, ops }
				: { type: "weekend", detail: detail as WeekendDetail, ops }) as Loaded;
		})()
			.then((value) => !cancelled && setLoaded(value))
			.catch(() => !cancelled && setLoaded({ type: "error" }));
		return () => {
			cancelled = true;
		};
	}, [tab, weekStart]);

	// Lo que necesitan el cronómetro y el botón de asistencia de la reunión que se ve.
	const derived = useMemo(() => {
		if (!loaded || (loaded.type !== "midweek" && loaded.type !== "weekend")) return null;
		const d = loaded.detail;
		const m = d.meeting;
		const cancelled = d.event?.action === "cancel";
		const timed = !cancelled && TIMED_STATUSES.has(m.status);
		let plan: TimedItem[] = [];
		if (timed) {
			plan =
				loaded.type === "midweek"
					? midweekTimerPlan(loaded.detail, partHeading)
					: weekendTimerPlan(withCoVisit(loaded.detail.meeting, loaded.detail.coVisit), loaded.detail.coVisit);
		}
		const attendance: AttendanceTarget | null = cancelled
			? null
			: { type: loaded.type, id: m.id, date: d.date ?? m.meetingDate, label: loaded.type === "midweek" ? "Entre semana" : "Fin de semana" };
		return { key: `${loaded.type}:${m.id}`, plan, chairmanUserId: m.chairmanUserId, attendance };
	}, [loaded]);

	const allowed = !!me && !!derived && canTimeMeeting(me, derived.chairmanUserId);
	const timer = useMeetingTimer(derived?.key ?? null, derived?.plan ?? [], allowed);

	// Pantalla completa: el cronómetro ocupa lo de debajo de las pestañas, así que se sube al inicio.
	const fullScreen = timer.mode === "full" && !!timer.run;
	useEffect(() => {
		if (fullScreen) window.scrollTo({ top: 0 });
	}, [fullScreen]);

	const attendanceBottom = !timer.active
		? FLOAT_BOTTOM
		: timer.run && timer.mode === "bar"
			? "bottom-[calc(72px+env(safe-area-inset-bottom)+120px)] md:bottom-[140px]"
			: "bottom-[calc(72px+env(safe-area-inset-bottom)+96px)] md:bottom-[108px]";

	const tabs: { value: MeetingType; label: string }[] = [
		{ value: "midweek", label: "Entre semana" },
		{ value: "weekend", label: "Fin de semana" },
	];

	return (
		<MeetingTimerContext.Provider value={timer}>
			<div className="flex flex-col gap-4">
				<PageHeader title="Reuniones" />
				<div role="tablist" aria-label="Reunión" className="flex rounded-full bg-surface-alt p-1">
					{tabs.map((t) => {
						const whenText = meetingWhen(schedule?.[t.value]);
						const selected = tab === t.value;
						return (
							<button
								key={t.value}
								type="button"
								role="tab"
								aria-selected={selected}
								onClick={() => setTab(t.value)}
								className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-full px-3 py-1 text-sm leading-tight transition-colors ${
									selected ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-soft hover:text-ink"
								}`}
							>
								{t.label}
								{/* Debajo, el día y la hora de esa reunión ESA semana («jue, 07:00 p. m.»). */}
								<span className="text-xs font-normal text-ink-soft">{whenText ?? " "}</span>
							</button>
						);
					})}
				</div>

				{fullScreen ? (
					<MeetingTimerFullPage />
				) : (
					<>
						<WeekSelector weekStart={weekStart} onChange={setWeekStart} />
						{loaded == null ? (
							<InlineLoader />
						) : loaded.type === "error" ? (
							<Empty>No se pudo cargar la reunión. Inténtalo de nuevo.</Empty>
						) : loaded.type === "none" ? (
							<Empty>No hay reunión programada para esta semana.</Empty>
						) : loaded.type === "midweek" ? (
							<MidweekView detail={loaded.detail} ops={loaded.ops} />
						) : (
							<WeekendView detail={loaded.detail} ops={loaded.ops} />
						)}
						{/* Espacio para que la barra del cronómetro y los botones flotantes no tapen lo último. */}
						{(timer.active || derived?.attendance) && <div className={timer.run ? "h-40" : "h-16"} aria-hidden="true" />}
					</>
				)}
			</div>
			<MeetingTimerOverlay />
			{derived?.attendance && timer.mode !== "full" && <MeetingAttendanceButton target={derived.attendance} bottomClass={attendanceBottom} />}
		</MeetingTimerContext.Provider>
	);
}

/** Selector de semana (lunes a domingo) con el mismo diseño que `WeekNav`, pero «Hoy» con la fecha local. */
function WeekSelector({ weekStart, onChange }: { weekStart: string; onChange: (w: string) => void }) {
	const shift = (days: number) => onChange(toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), days)));
	const btn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt";
	return (
		<div className="flex w-full items-center gap-2 rounded-full bg-surface p-1">
			<button type="button" onClick={() => shift(-7)} aria-label="Semana anterior" className={btn}>
				<ChevronLeft size={20} />
			</button>
			<p className="min-w-0 flex-1 whitespace-nowrap text-center text-sm font-semibold text-ink sm:text-[15px]">{formatWeekRangeEs(weekStart)}</p>
			<button type="button" onClick={() => shift(7)} aria-label="Semana siguiente" className={btn}>
				<ChevronRight size={20} />
			</button>
			<button
				type="button"
				onClick={() => onChange(thisMonday())}
				className="min-h-11 shrink-0 rounded-full border border-border px-4 text-sm font-medium text-ink hover:bg-surface-alt"
			>
				Hoy
			</button>
		</div>
	);
}

// --- Piezas de diseño compartidas ---

function Empty({ children }: { children: React.ReactNode }) {
	return <p className="py-10 text-center text-sm text-ink-soft">{children}</p>;
}

function MeetingTitle({ date, subtitle }: { date: string; subtitle?: string | null }) {
	return (
		<div className="px-1">
			<h2 className="font-display text-2xl font-medium text-ink">{formatLongDate(date)}</h2>
			{subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
		</div>
	);
}

/** Barra del color de la sección con su ícono y el texto en mayúsculas (como en la guía impresa) y, pegado debajo, su contenido tenue. */
function Section({
	title,
	icon: Icon,
	bar,
	soft,
	children,
}: {
	title: string;
	/** Ícono de la app Android (`SectionIcon`) o, para Acomodadores, uno de lucide (la app usa el de persona de Material). */
	icon?: SectionIconName | LucideIcon;
	/** Clases completas (no interpoladas) para que Tailwind las detecte. */
	bar: string;
	soft: string;
	children: React.ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-[20px]">
			{/* Texto e ícono en blanco sobre el color de la sección (como en la guía impresa y en la app). */}
			{typeof Icon === "string" ? (
				<SectionBar title={title} icon={Icon} bar={bar} />
			) : (
				<div className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-bold uppercase tracking-wider ${bar}`}>
					{Icon ? <Icon size={22} strokeWidth={2.25} aria-hidden="true" /> : null}
					{title}
				</div>
			)}
			<div className={`divide-y divide-border/60 ${soft}`}>{children}</div>
		</section>
	);
}

/** Texto que abre JW Library (enlace jw.org/finder) en el documento: parte de la guía, artículo de La Atalaya o bosquejo. */
function JwLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" title="Abrir en JW Library" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
			{children}
		</a>
	);
}

function Line({ label, value, href }: { label: string; value: string | null | undefined; href?: string | null }) {
	const text = value?.trim() ? value : "Sin asignar";
	return (
		// Mismo formato que las partes: «Etiqueta: Nombre» (nombre en negrita).
		<p className="px-4 py-2.5 text-sm">
			<span className="text-ink-soft">{label}: </span>
			<span className="font-semibold text-ink">{href && value?.trim() ? <JwLink href={href}>{text}</JwLink> : text}</span>
		</p>
	);
}

function PartRow({
	title,
	minutes,
	description,
	lines,
	timerKey,
	href,
}: {
	href?: string | null;
	title: string;
	minutes?: number | null;
	description?: string | null;
	lines: [string, string | null | undefined][];
	timerKey?: string;
}) {
	// La parte que se está cronometrando se resalta con un borde del color de la app.
	const now = useTimer().runningKey;
	const current = !!timerKey && now === timerKey;
	return (
		<div className={current ? "m-1 rounded-[14px] border-2 border-accent bg-accent/10 px-3 py-2" : "px-4 py-3"}>
			<p className="text-[15px] font-semibold text-ink">
				{href ? <JwLink href={href}>{title}</JwLink> : title}
				{minutes ? <span className="ml-1.5 text-[13px] font-normal text-ink-soft">({minutes} mins.)</span> : null}
			</p>
			{description?.trim() && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
			{lines.map(([label, value]) => (
				<p key={label} className="mt-1 text-sm">
					<span className="text-ink-soft">{label}: </span>
					<span className="font-semibold text-ink">{value?.trim() ? value : "Sin asignar"}</span>
				</p>
			))}
			{timerKey && <TimerLine timerKey={timerKey} className="mt-1.5" />}
		</div>
	);
}

function SongCard({ text, timerKey }: { text: string; timerKey?: string }) {
	// La canción que está sonando (con el cronómetro andando) se resalta igual que una parte.
	const now = useTimer().runningKey;
	const current = !!timerKey && now === timerKey;
	return (
		<div className={`rounded-[20px] px-4 py-3.5 text-[15px] font-semibold text-ink ${current ? "border-2 border-accent bg-accent/10" : "bg-surface"}`}>
			{text}
		</div>
	);
}

/** Reunión cancelada por un evento: el evento en lugar del programa. */
function EventCard({ event }: { event: MeetingEvent }) {
	const range = event.startDate === event.endDate ? formatShortDate(event.startDate) : `${formatShortDate(event.startDate)} — ${formatShortDate(event.endDate)}`;
	return (
		<Card>
			<div className="flex items-center gap-2.5">
				<CalendarDays size={24} className="shrink-0 text-accent" />
				<h3 className="font-display text-xl font-medium text-ink">{event.name}</h3>
			</div>
			<p className="mt-1 text-sm text-ink-soft">{range} · Esta semana no hay reunión</p>
			{event.message?.trim() && <p className="mt-3 whitespace-pre-line text-sm text-ink">{event.message}</p>}
		</Card>
	);
}

/** Esta semana la reunión cambia de día y hora por un evento. */
function MovedNote({ event, date, time }: { event: MeetingEvent; date: string | null; time: string | null }) {
	const at = meetingWhen({ time });
	const whenText = [date ? `el ${formatLongDate(date).toLowerCase()}` : null, at ? `a las ${at}` : null].filter(Boolean).join(" ");
	return (
		<div className="rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
			{event.name}: esta semana la reunión es {whenText}
		</div>
	);
}

/** Semana de la visita del superintendente: aviso de cómo cambia el programa. */
function CoVisitNote({ co, midweek }: { co: TimerCoVisit; midweek: boolean }) {
	return (
		<div className="rounded-2xl bg-accent-soft px-4 py-3">
			<p className="text-sm font-semibold text-accent">Visita del superintendente de circuito · {co.overseerName}</p>
			<p className="mt-0.5 text-[13px] text-ink">
				{midweek
					? "El discurso de servicio reemplaza al Estudio bíblico de la congregación."
					: "La Atalaya dura 30 minutos y al final hay un discurso del superintendente."}
			</p>
		</div>
	);
}

/** Acomodadores: una sección más al final del programa, solo con los puestos que tienen a alguien. */
function OperationalSection({ items }: { items: OperationalItem[] }) {
	const assigned = items.filter((i) => i.assignedUserName?.trim());
	if (assigned.length === 0) return null;
	const isAv = (i: OperationalItem) => i.privilegeId === "priv_audio_console" || i.privilegeId === "priv_video_zoom";
	const av = assigned.filter(isAv);
	const ushers = assigned.filter((i) => !isAv(i));
	// Si la asignación tiene nombre en la plantilla, ese nombre en lugar del de la tarea (como `slotDisplayName`).
	const label = (i: OperationalItem) => i.position?.trim() || i.privilegeName;
	const group = (title: string, list: OperationalItem[]) =>
		list.length > 0 && (
			<div className="py-1">
				{/* El subtítulo solo hace falta si hay de los dos grupos (si no, repetiría «Acomodadores»). */}
				{av.length > 0 && ushers.length > 0 && <p className="px-4 pt-2 text-[13px] font-semibold text-ink-soft">{title}</p>}
				{list.map((i) => (
					<Line key={i.id} label={label(i)} value={i.assignedUserName} />
				))}
			</div>
		);
	return (
		<Section title="Acomodadores" icon={User} bar="bg-accent text-accent-ink" soft="bg-surface">
			{group("Audio / Video", av)}
			{group("Acomodadores", ushers)}
		</Section>
	);
}

// --- Entre semana ---

const MIDWEEK_GROUPS = [
	{ title: "Tesoros de la Biblia", icon: "treasures", bar: "bg-meeting-treasures text-white", soft: "bg-meeting-treasures-soft" },
	{ title: "Seamos mejores maestros", icon: "ministry", bar: "bg-meeting-ministry text-white", soft: "bg-meeting-ministry-soft" },
	{ title: "Nuestra vida cristiana", icon: "living", bar: "bg-meeting-living text-white", soft: "bg-meeting-living-soft" },
] as const;

function groupOf(a: MidweekAssignment): number {
	if (["treasures_talk", "spiritual_gems", "bible_reading"].includes(a.sectionType)) return 0;
	if (a.sectionType === "student_assignment") return 1;
	return 2;
}

function MidweekView({ detail: d, ops }: { detail: MidweekDetail; ops: OperationalItem[] }) {
	const timer = useTimer();
	const m = d.meeting;
	const date = d.date ?? m.meetingDate;
	if (d.event?.action === "cancel") {
		return (
			<div className="flex flex-col gap-3">
				<MeetingTitle date={date} subtitle={m.weekLabel} />
				<EventCard event={d.event} />
			</div>
		);
	}
	const co = d.coVisit;
	const showWords = timer.active && !!timer.run;
	const parts = d.assignments.filter((a) => a.sectionType !== "prayer").sort((a, b) => a.sequenceOrder - b.sequenceOrder);
	const finalPrayer = d.assignments.find((a) => a.sectionType === "prayer")?.mainAssigneeName;
	const coSong = co?.midweekTalk.song ?? null;
	const closingSong = coSong ?? m.closingSongNumber;

	return (
		<div className="flex flex-col gap-3">
			<MeetingTitle date={date} subtitle={m.weekLabel} />
			{d.event?.action === "move" && <MovedNote event={d.event} date={d.date} time={d.time} />}
			{co && <CoVisitNote co={co} midweek />}
			<div className="rounded-[20px] bg-surface py-1">
				<Line label="Presidente" value={m.chairmanName} />
				{/* Las oraciones solo se muestran si ya hay alguien asignado. */}
				{!d.skipOpeningPrayer && m.openingPrayerName?.trim() && <Line label="Oración inicial" value={m.openingPrayerName} />}
				{!d.skipOpeningPrayer && <TimerLine timerKey="prayer:opening" className="px-4 pb-2" />}
				{finalPrayer?.trim() && <Line label="Oración final" value={finalPrayer} />}
				<TimerLine timerKey="prayer:closing" className="px-4 pb-2" />
			</div>

			{/* Cada canción va en su lugar del programa: inicial antes de Tesoros, intermedia en Nuestra vida cristiana y final al cierre. */}
			{m.openingSongNumber != null && <SongCard text={songText(m.openingSongNumber, m.openingSongTitle)} timerKey="song:opening" />}
			{/* Las palabras del presidente solo salen con el cronómetro andando (para ver su hora). */}
			{showWords && (
				<div className="rounded-[20px] bg-surface">
					<PartRow title="Palabras de introducción" minutes={1} lines={[]} timerKey="intro" />
				</div>
			)}

			{MIDWEEK_GROUPS.map((g, gi) => {
				const rows = parts.filter((a) => groupOf(a) === gi);
				if (rows.length === 0 && gi !== 1) return null;
				let cbsDone = false;
				return (
					<Section key={g.title} title={g.title} icon={g.icon} bar={g.bar} soft={g.soft}>
						{gi === 2 && m.middleSongNumber != null && (
							<PartRow title={songText(m.middleSongNumber, m.middleSongTitle)} lines={[]} timerKey="song:middle" />
						)}
						{rows.map((a) => {
							if (a.sectionType === "cbs") {
								if (cbsDone) return null;
								cbsDone = true;
								// Semana de la visita: el discurso de servicio del superintendente reemplaza al estudio.
								if (co) {
									return (
										<PartRow
											key={a.id}
											title="Discurso de servicio"
											minutes={30}
											description={co.midweekTalk.title}
											lines={[["Superintendente de circuito", co.overseerName]]}
											timerKey="co:service"
										/>
									);
								}
								const cbs = rows.filter((r) => r.sectionType === "cbs");
								const conductor = cbs.find((r) => r.sectionTitle === "Conductor") ?? cbs[0];
								const reader = cbs.find((r) => r.sectionTitle === "Lector") ?? cbs[1];
								return (
									<PartRow
										key={a.id}
										title={`${conductor.partNumber ? `${conductor.partNumber}. ` : ""}Estudio bíblico de la congregación`}
										href={conductor.jwLink}
										minutes={conductor.durationMinutes}
										description={conductor.description}
										lines={[
											["Conductor", conductor.mainAssigneeName],
											["Lector", reader?.mainAssigneeName],
										]}
										timerKey={conductor.id}
									/>
								);
							}
							const lines: [string, string | null | undefined][] = [["Asignado", a.mainAssigneeName]];
							if (a.sectionType === "student_assignment" && a.assistantAssigneeName) lines.push(["Ayudante", a.assistantAssigneeName]);
							if (m.hasAuxRoom && !co && (a.sectionType === "student_assignment" || a.sectionType === "bible_reading")) {
								lines.push(["Sala", a.room === "auxiliary" ? "Auxiliar" : "Principal"]);
							}
							return (
								<PartRow
									key={a.id}
									title={`${a.partNumber ? `${a.partNumber}. ` : ""}${partHeading(a)}`}
									href={a.jwLink}
									minutes={a.durationMinutes}
									description={a.description}
									lines={lines}
									timerKey={a.id}
								/>
							);
						})}
						{rows.length === 0 && <p className="px-4 py-4 text-sm text-ink-soft">Sin partes todavía.</p>}
					</Section>
				);
			})}

			{showWords && (
				<div className="rounded-[20px] bg-surface">
					<PartRow title="Palabras de conclusión" minutes={3} lines={[]} timerKey="conclusion" />
				</div>
			)}
			{/* Semana de la visita: la canción final es la del discurso de servicio del superintendente. */}
			{closingSong != null && <SongCard text={songText(closingSong, coSong != null ? null : m.closingSongTitle)} timerKey="song:closing" />}
			<OperationalSection items={ops} />
		</div>
	);
}

// --- Fin de semana ---

/** Visita del superintendente: él da el discurso público (con su canción) y su canción final. */
function withCoVisit(m: WeekendMeeting, co: TimerCoVisit | null): WeekendMeeting {
	if (!co) return m;
	return {
		...m,
		speakerName: co.overseerName,
		speakerCongregationName: null,
		talkOutlineNumber: null,
		talkOutlineTitle: co.publicTalk.title ?? m.talkOutlineTitle,
		talkSongNumber: co.publicTalk.song ?? m.talkSongNumber,
		talkSongTitle: co.publicTalk.song != null ? null : m.talkSongTitle,
		closingSongNumber: co.finalTalk.song ?? m.closingSongNumber,
		closingSongTitle: co.finalTalk.song != null ? null : m.closingSongTitle,
	};
}

function WeekendView({ detail: wd, ops }: { detail: WeekendDetail; ops: OperationalItem[] }) {
	const co = wd.coVisit;
	const m = withCoVisit(wd.meeting, co);
	const date = wd.date ?? m.meetingDate;
	if (wd.event?.action === "cancel") {
		return (
			<div className="flex flex-col gap-3">
				<MeetingTitle date={date} />
				<EventCard event={wd.event} />
			</div>
		);
	}
	const outline = [m.talkOutlineNumber != null ? `${m.talkOutlineNumber}.` : null, m.talkOutlineTitle].filter(Boolean).join(" ");
	const speaker = [m.speakerName, m.speakerCongregationName ? `(${m.speakerCongregationName})` : null].filter(Boolean).join(" ");

	const talkPart = (
		<Section key="talk" title="Discurso público" icon="talk" bar="bg-meeting-talk text-white" soft="bg-meeting-talk-soft">
			<Line label="Orador" value={speaker} />
			<Line label="Discurso" value={outline} href={co ? null : m.talkOutlineLink} />
			<TimerLine timerKey="talk" className="px-4 py-2.5" />
		</Section>
	);
	const talkSong = m.talkSongNumber != null && <SongCard key="talk-song" text={songText(m.talkSongNumber, m.talkSongTitle)} timerKey="song:talk" />;
	const watchtowerPart = [
		m.watchtowerSongNumber != null && (
			<SongCard key="wt-song" text={songText(m.watchtowerSongNumber, m.watchtowerSongTitle)} timerKey="song:watchtower" />
		),
		<Section key="wt" title="La Atalaya" icon="watchtower" bar="bg-meeting-watchtower text-white" soft="bg-meeting-watchtower-soft">
			{m.watchtowerTitle?.trim() && <Line label="Estudio" value={m.watchtowerTitle} href={m.watchtowerLink} />}
			<Line label="Conductor" value={m.watchtowerConductorName} />
			<Line label="Lector" value={m.watchtowerReaderName} />
			{co && <Line label="Duración" value="30 mins." />}
			<TimerLine timerKey="watchtower" className="px-4 py-2.5" />
		</Section>,
		// Visita: después de La Atalaya, el discurso final del superintendente.
		co && (
			<Section key="co-final" title="Discurso final" icon="talk" bar="bg-meeting-talk text-white" soft="bg-meeting-talk-soft">
				<Line label="Orador" value={co.overseerName} />
				<Line label="Discurso" value={co.finalTalk.title} />
				<TimerLine timerKey="co:final" className="px-4 py-2.5" />
			</Section>
		),
		m.closingSongNumber != null && <SongCard key="closing" text={songText(m.closingSongNumber, m.closingSongTitle)} timerKey="song:closing" />,
	];

	return (
		<div className="flex flex-col gap-3">
			<MeetingTitle date={date} />
			{wd.event?.action === "move" && <MovedNote event={wd.event} date={wd.date} time={wd.time} />}
			{co && <CoVisitNote co={co} midweek={false} />}
			<div className="rounded-[20px] bg-surface py-1">
				<Line label="Presidente" value={m.chairmanName} />
				{m.prayerName?.trim() && <Line label="Oración" value={m.prayerName} />}
				<TimerLine timerKey="prayer:opening" className="px-4 pb-2" />
				<TimerLine timerKey="prayer:closing" className="px-4 pb-2" />
			</div>
			{/* Normalmente se empieza con la canción y el discurso; a veces con La Atalaya y el discurso va después. */}
			{m.watchtowerFirst ? (
				<>
					{watchtowerPart}
					{talkPart}
					{talkSong}
				</>
			) : (
				<>
					{talkSong}
					{talkPart}
					{watchtowerPart}
				</>
			)}
			{/* Las notas solo llegan a quien administra el módulo (la API las quita a los demás). */}
			{m.notes?.trim() && (
				<Section title="Notas" bar="bg-ink-soft text-bg" soft="bg-surface">
					<p className="whitespace-pre-line px-4 py-3 text-sm text-ink">{m.notes}</p>
				</Section>
			)}
			<OperationalSection items={ops} />
		</div>
	);
}
