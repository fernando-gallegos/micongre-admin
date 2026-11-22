/**
 * Cronómetro de la reunión («Ver tiempo de asignaciones»): lógica pura (sin navegador), igual que `data/MeetingTimer.kt` de la app
 * Android, para poder probarla.
 *
 * El programa se vuelve una lista de {@link TimedItem} en orden: canciones (5 minutos), oraciones (2) y partes, todo contado.
 * Al tocar el botón del reloj empieza el primer elemento; con «Terminó» se cierra el actual y, entre **cualquier** elemento y el
 * siguiente, queda el **cambio** (1 minuto en el plan) hasta tocar «Empezar».
 */

export interface TimedItem {
	/** Clave estable para unir el tiempo con su fila del programa (id de la asignación, "intro", "song:opening"…). */
	key: string;
	title: string;
	/** Minutos asignados; 0 = sin tiempo fijo (no se juzga si se pasó). */
	minutes: number;
	isSong?: boolean;
}

/** Minutos de cambio entre dos asignaciones seguidas. */
export const CHANGE_MINUTES = 1;
export const SONG_MINUTES = 5;
const PRAYER_MINUTES = 2;
const MINUTE_MS = 60_000;

/** Un toque: marca el inicio o el fin de un elemento. Un mismo toque puede llevar varias (terminar uno y empezar el siguiente). */
export interface TimerMark {
	index: number;
	isEnd: boolean;
	at: number;
}

export interface TimerRun {
	startedAt: number;
	taps: TimerMark[][];
}

export type TimerPhase = { kind: "running"; index: number } | { kind: "change"; next: number } | { kind: "finished" };

function lastMark(run: TimerRun, i: number, isEnd: boolean): number | null {
	const marks = run.taps.flat();
	for (let k = marks.length - 1; k >= 0; k--) {
		if (marks[k].index === i && marks[k].isEnd === isEnd) return marks[k].at;
	}
	return null;
}

export const startOf = (run: TimerRun, i: number) => lastMark(run, i, false);
export const endOf = (run: TimerRun, i: number) => lastMark(run, i, true);

export function phase(run: TimerRun, plan: TimedItem[]): TimerPhase {
	const i = plan.findIndex((_, k) => endOf(run, k) == null);
	if (i < 0) return { kind: "finished" };
	return startOf(run, i) != null ? { kind: "running", index: i } : { kind: "change", next: i };
}

/** Empieza la reunión: el primer elemento corre desde `now`. */
export function startRun(plan: TimedItem[], now: number): TimerRun {
	return { startedAt: now, taps: plan.length === 0 ? [] : [[{ index: 0, isEnd: false, at: now }]] };
}

/** Entre un elemento y el siguiente (partes, canciones y oraciones) siempre hay un minuto de cambio, que se cuenta. */
function hasChange(plan: TimedItem[], i: number): boolean {
	return plan[i + 1] != null;
}

const prayer = (key: string): TimedItem => ({ key, title: "Oración", minutes: PRAYER_MINUTES });

/** «Terminó»: cierra el elemento en curso; si no toca cambio, el siguiente empieza en ese mismo momento. */
export function finish(run: TimerRun, plan: TimedItem[], now: number): TimerRun {
	const p = phase(run, plan);
	if (p.kind !== "running") return run;
	const tap: TimerMark[] = [{ index: p.index, isEnd: true, at: now }];
	if (p.index + 1 < plan.length && !hasChange(plan, p.index)) tap.push({ index: p.index + 1, isEnd: false, at: now });
	return { ...run, taps: [...run.taps, tap] };
}

/** «Empezar»: termina el cambio y empieza la siguiente asignación. */
export function begin(run: TimerRun, plan: TimedItem[], now: number): TimerRun {
	const p = phase(run, plan);
	if (p.kind !== "change") return run;
	return { ...run, taps: [...run.taps, [{ index: p.next, isEnd: false, at: now }]] };
}

/** Deshace el último toque; null si con eso no queda nada (se vuelve al botón del reloj). */
export function undo(run: TimerRun): TimerRun | null {
	return run.taps.length <= 1 ? null : { ...run, taps: run.taps.slice(0, -1) };
}

/** Hora en que debería iniciar cada elemento según el plan, contando desde que se tocó el reloj. */
export function plannedStarts(plan: TimedItem[], startedAt: number): number[] {
	let t = startedAt;
	return plan.map((item, i) => {
		const at = t;
		t += item.minutes * MINUTE_MS + (hasChange(plan, i) ? CHANGE_MINUTES * MINUTE_MS : 0);
		return at;
	});
}

/** Lo que se pasó (ms) del tiempo asignado; 0 si estuvo en tiempo o si no tiene tiempo fijo. */
export function overtimeMs(item: TimedItem, durationMs: number): number {
	return item.minutes <= 0 ? 0 : Math.max(0, durationMs - item.minutes * MINUTE_MS);
}

/** Diferencia con el tiempo asignado: «+1m 15s», «-20s», «+2m» (0 = «0s», en tiempo). */
export function diffText(ms: number): string {
	const total = Math.floor(Math.abs(ms) / 1000);
	const sign = ms > 0 && total > 0 ? "+" : total > 0 ? "-" : "";
	const m = Math.floor(total / 60);
	const s = total % 60;
	return sign + (m === 0 ? `${s}s` : s === 0 ? `${m}m` : `${m}m ${s}s`);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** «m:ss» (o «h:mm:ss»). */
export function clockText(ms: number): string {
	const s = Math.floor(Math.max(0, ms) / 1000);
	const h = Math.floor(s / 3600);
	return h > 0 ? `${h}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}` : `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** «7:05 p. m.» — la hora del reloj (zona del navegador) en que inicia una parte. */
export function clockOf(ms: number): string {
	const d = new Date(ms);
	const h = d.getHours() % 12;
	return `${h === 0 ? 12 : h}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? "a. m." : "p. m."}`;
}

// --- Programas ---

/** Lo mínimo de cada asignación de entre semana que necesita el plan (el GET /api/midweek/[id] trae más). */
export interface TimerMidweekAssignment {
	id: string;
	sectionType: string;
	sectionTitle?: string | null;
	sequenceOrder: number;
	room?: string | null;
	durationMinutes?: number | null;
}

export interface TimerCoVisit {
	overseerName: string;
	midweekTalk: { title: string | null; song: number | null };
	publicTalk: { title: string | null; song: number | null };
	finalTalk: { title: string | null; song: number | null };
}

export interface TimerMidweekDetail {
	meeting: {
		openingSongNumber?: number | null;
		openingSongTitle?: string | null;
		middleSongNumber?: number | null;
		middleSongTitle?: string | null;
		closingSongNumber?: number | null;
		closingSongTitle?: string | null;
	};
	assignments: TimerMidweekAssignment[];
	skipOpeningPrayer?: boolean;
	coVisit?: TimerCoVisit | null;
}

export interface TimerWeekendMeeting {
	watchtowerFirst?: boolean;
	talkSongNumber?: number | null;
	talkSongTitle?: string | null;
	watchtowerSongNumber?: number | null;
	watchtowerSongTitle?: string | null;
	closingSongNumber?: number | null;
	closingSongTitle?: string | null;
}

const DEFAULT_MINUTES: Record<string, number> = { treasures_talk: 10, spiritual_gems: 10, bible_reading: 4, cbs: 30 };

/** «Canción 65: título», «Canción 65» o «Canción» (más « y oración» si lleva la oración). */
export function songTitle(number: number | null | undefined, title: string | null | undefined, prayer: boolean): string {
	const song = number == null ? "Canción" : !title ? `Canción ${number}` : `Canción ${number}: ${title}`;
	return prayer ? `${song} y oración` : song;
}

const FIRST_SECTIONS = new Set(["treasures_talk", "spiritual_gems", "bible_reading", "student_assignment"]);
const LIVING_SECTIONS = new Set(["christian_living", "congregation_needs", "living_custom"]);

/** Entre semana, en el orden del S-140: canción y oración, introducción, Tesoros, Maestros, canción, Vida cristiana, estudio, conclusión, canción y oración. */
export function midweekTimerPlan(d: TimerMidweekDetail, heading: (a: TimerMidweekAssignment) => string): TimedItem[] {
	const m = d.meeting;
	// La sala auxiliar va en paralelo: solo cuenta la principal. (sort es estable: a igual orden, el del servidor.)
	const parts = d.assignments.filter((a) => a.sectionType !== "prayer" && a.room !== "auxiliary").sort((a, b) => a.sequenceOrder - b.sequenceOrder);
	const co = d.coVisit ?? null;
	const timed = (a: TimerMidweekAssignment): TimedItem => ({ key: a.id, title: heading(a), minutes: a.durationMinutes ?? DEFAULT_MINUTES[a.sectionType] ?? 0 });
	const first = parts.filter((a) => FIRST_SECTIONS.has(a.sectionType));
	const living = parts.filter((a) => LIVING_SECTIONS.has(a.sectionType));
	const cbsList = parts.filter((a) => a.sectionType === "cbs");
	const cbs = cbsList.find((a) => a.sectionTitle === "Conductor") ?? cbsList[0];
	const skip = !!d.skipOpeningPrayer;
	const plan: TimedItem[] = [
		{ key: "song:opening", title: songTitle(m.openingSongNumber, m.openingSongTitle, false), minutes: SONG_MINUTES, isSong: true },
		...(skip ? [] : [prayer("prayer:opening")]),
		{ key: "intro", title: "Palabras de introducción", minutes: 1 },
		...first.map(timed),
		{ key: "song:middle", title: songTitle(m.middleSongNumber, m.middleSongTitle, false), minutes: SONG_MINUTES, isSong: true },
		...living.map(timed),
	];
	// Semana de la visita: el discurso de servicio del superintendente (30 min) en lugar del estudio.
	if (co) plan.push({ key: "co:service", title: co.midweekTalk.title || "Discurso de servicio", minutes: 30 });
	else if (cbs) plan.push({ ...timed(cbs), title: "Estudio bíblico de la congregación" });
	plan.push({ key: "conclusion", title: "Palabras de conclusión", minutes: 3 });
	plan.push({
		key: "song:closing",
		title: co?.midweekTalk.song != null ? songTitle(co.midweekTalk.song, null, false) : songTitle(m.closingSongNumber, m.closingSongTitle, false),
		minutes: SONG_MINUTES,
		isSong: true,
	});
	plan.push(prayer("prayer:closing"));
	return plan;
}

/** Fin de semana: canción, oración, discurso público (30), canción, La Atalaya (60), canción y oración; o al revés si empieza con La Atalaya. */
export function weekendTimerPlan(m: TimerWeekendMeeting, co: TimerCoVisit | null = null): TimedItem[] {
	const talkSong: TimedItem = { key: "song:talk", title: songTitle(m.talkSongNumber, m.talkSongTitle, false), minutes: SONG_MINUTES, isSong: true };
	const talk: TimedItem = { key: "talk", title: "Discurso público", minutes: 30 };
	const wtSong: TimedItem = { key: "song:watchtower", title: songTitle(m.watchtowerSongNumber, m.watchtowerSongTitle, false), minutes: SONG_MINUTES, isSong: true };
	// Visita del superintendente: La Atalaya de 30 minutos y, después, su discurso final (30).
	const wt: TimedItem = { key: "watchtower", title: "Estudio de La Atalaya", minutes: co ? 30 : 60 };
	const final: TimedItem | null = co ? { key: "co:final", title: co.finalTalk.title || "Discurso final", minutes: 30 } : null;
	const closing: TimedItem = { key: "song:closing", title: songTitle(m.closingSongNumber, m.closingSongTitle, false), minutes: SONG_MINUTES, isSong: true };
	const list = m.watchtowerFirst
		? [wtSong, prayer("prayer:opening"), wt, final, closing, talk, talkSong, prayer("prayer:closing")]
		: [talkSong, prayer("prayer:opening"), talk, wtSong, wt, final, closing, prayer("prayer:closing")];
	return list.filter((x): x is TimedItem => x != null);
}

/** ¿Puede usar el cronómetro de esta reunión? Quien la preside, el consejero auxiliar o quien tenga «Ver tiempo de asignaciones». */
export function canTimeMeeting(
	me: { id: string; privilegeCodes: string[]; appointmentTypes: string[] },
	chairmanUserId: string | null | undefined,
): boolean {
	return (
		me.privilegeCodes.includes("meeting_timer") ||
		me.appointmentTypes.includes("auxiliary_counselor") ||
		(chairmanUserId != null && chairmanUserId === me.id)
	);
}

/** Lo que muestra el cronómetro según el momento: etiqueta, parte, tiempo, meta y si ya se pasó. */
export function timerDisplay(
	run: TimerRun,
	plan: TimedItem[],
	now: number,
): { label: string; title: string; clock: string; goal: string | null; over: boolean } {
	const p = phase(run, plan);
	if (p.kind === "running") {
		const item = plan[p.index];
		const elapsed = now - (startOf(run, p.index) ?? now);
		return { label: "Ahora", title: item.title, clock: clockText(elapsed), goal: item.minutes > 0 ? `${item.minutes}:00` : null, over: overtimeMs(item, elapsed) > 0 };
	}
	if (p.kind === "change") {
		const since = endOf(run, p.next - 1) ?? now;
		const elapsed = now - since;
		return { label: "Cambio · sigue", title: plan[p.next].title, clock: clockText(elapsed), goal: `${CHANGE_MINUTES}:00`, over: elapsed > CHANGE_MINUTES * MINUTE_MS };
	}
	const end = endOf(run, plan.length - 1) ?? now;
	return { label: "Reunión terminada", title: "Duración total", clock: clockText(end - run.startedAt), goal: null, over: false };
}

/** La clave del elemento que se cronometra ahora (null en un cambio o al terminar). */
export function runningKey(run: TimerRun | null, plan: TimedItem[]): string | null {
	if (!run) return null;
	const p = phase(run, plan);
	return p.kind === "running" ? (plan[p.index]?.key ?? null) : null;
}

/** Tiempos guardados en este navegador: se borran solos a las dos semanas. */
export const TIMER_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/** Lee un `TimerRun` guardado (JSON); null si no es válido. */
export function parseRun(raw: string | null): TimerRun | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as TimerRun;
		if (typeof v?.startedAt !== "number" || !Array.isArray(v.taps)) return null;
		return v;
	} catch {
		return null;
	}
}

/** «jue, 07:00 p. m.» debajo de cada pestaña (o el nombre del evento que la cancela). */
export function meetingWhen(slot: { day?: string | null; time?: string | null; cancelledBy?: string | null } | null | undefined): string | null {
	if (!slot) return null;
	if (slot.cancelledBy) return slot.cancelledBy;
	const key = slot.day?.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase() ?? "";
	const SHORT: Record<string, string> = { lunes: "lun", martes: "mar", miercoles: "mié", jueves: "jue", viernes: "vie", sabado: "sáb", domingo: "dom" };
	const day = key ? (SHORT[key] ?? slot.day!.trim().slice(0, 3).toLowerCase()) : null;
	const match = slot.time?.trim().match(/^(\d{1,2}):(\d{2})/);
	let time: string | null = null;
	if (match) {
		const h = Number(match[1]);
		time = `${pad2(h % 12 === 0 ? 12 : h % 12)}:${match[2]} ${h < 12 ? "a. m." : "p. m."}`;
	}
	const text = [day, time].filter(Boolean).join(", ");
	return text || null;
}
