import { describe, expect, it } from "vitest";
import {
	begin,
	canTimeMeeting,
	clockText,
	diffText,
	endOf,
	finish,
	meetingWhen,
	midweekTimerPlan,
	overtimeMs,
	parseRun,
	phase,
	plannedStarts,
	runningKey,
	startOf,
	startRun,
	timerDisplay,
	undo,
	weekendTimerPlan,
	type TimedItem,
} from "@/lib/meetings/timer";

const min = 60_000;
const plan: TimedItem[] = [
	{ key: "song:opening", title: "Canción", minutes: 7, isSong: true },
	{ key: "intro", title: "Introducción", minutes: 1 },
	{ key: "a", title: "Discurso", minutes: 10 },
	{ key: "song:middle", title: "Canción", minutes: 5, isSong: true },
	{ key: "b", title: "Estudio", minutes: 30 },
];

describe("cronómetro de la reunión", () => {
	it("horas del plan con un minuto de cambio entre todo (canciones incluidas)", () => {
		// canción 7 (+1) → intro 1 (+1) → discurso 10 (+1) → canción 5 (+1) → estudio
		expect(plannedStarts(plan, 0)).toEqual([0, 8 * min, 10 * min, 21 * min, 27 * min]);
	});

	it("terminar y empezar", () => {
		let run = startRun(plan, 0);
		expect(phase(run, plan)).toEqual({ kind: "running", index: 0 });
		// También después de una canción queda el cambio hasta «Empezar».
		run = finish(run, plan, 7 * min);
		expect(phase(run, plan)).toEqual({ kind: "change", next: 1 });
		run = begin(run, plan, 7 * min);
		expect(phase(run, plan)).toEqual({ kind: "running", index: 1 });
		// Entre dos asignaciones queda el cambio hasta «Empezar».
		run = finish(run, plan, 8 * min);
		expect(phase(run, plan)).toEqual({ kind: "change", next: 2 });
		expect(runningKey(run, plan)).toBeNull();
		// «Terminó» en un cambio no hace nada; «Empezar» corriendo tampoco.
		expect(finish(run, plan, 8.5 * min)).toBe(run);
		run = begin(run, plan, 9 * min);
		expect(begin(run, plan, 9.5 * min)).toBe(run);
		expect(startOf(run, 2)).toBe(9 * min);
		expect(runningKey(run, plan)).toBe("a");
		// Antes de una canción también hay cambio.
		run = finish(run, plan, 21 * min);
		expect(phase(run, plan)).toEqual({ kind: "change", next: 3 });
		expect(overtimeMs(plan[2], endOf(run, 2)! - startOf(run, 2)!)).toBe(2 * min);
		run = begin(run, plan, 21 * min);
		run = finish(begin(finish(run, plan, 26 * min), plan, 26 * min), plan, 55 * min);
		expect(phase(run, plan)).toEqual({ kind: "finished" });
		expect(overtimeMs(plan[4], endOf(run, 4)! - startOf(run, 4)!)).toBe(0);
		expect(timerDisplay(run, plan, 99 * min)).toMatchObject({ label: "Reunión terminada", clock: "55:00", over: false });
	});

	it("deshacer quita el último toque completo", () => {
		const run = begin(finish(startRun(plan, 0), plan, 7 * min), plan, 7 * min);
		const back = undo(run)!;
		expect(phase(back, plan)).toEqual({ kind: "change", next: 1 });
		expect(startOf(back, 1)).toBeNull();
		expect(undo(startRun(plan, 0))).toBeNull();
	});

	it("sin tiempo fijo no se pasa; textos del reloj", () => {
		expect(overtimeMs({ key: "x", title: "x", minutes: 0 }, 99 * min)).toBe(0);
		expect(clockText(65_000)).toBe("1:05");
		expect(clockText(-5)).toBe("0:00");
		expect(clockText(3_723_000)).toBe("1:02:03");
		expect(diffText(75_000)).toBe("+1m 15s");
		expect(diffText(-20_400)).toBe("-20s");
		expect(diffText(120_000)).toBe("+2m");
		expect(diffText(300)).toBe("0s");
	});

	it("lo que muestra: en curso, cambio y si se pasó", () => {
		let run = startRun(plan, 0);
		expect(timerDisplay(run, plan, 8 * min)).toMatchObject({ label: "Ahora", clock: "8:00", goal: "7:00", over: true });
		run = finish(begin(finish(run, plan, 7 * min), plan, 7 * min), plan, 8 * min);
		expect(timerDisplay(run, plan, 8 * min + 30_000)).toMatchObject({ label: "Cambio · sigue", title: "Discurso", clock: "0:30", goal: "1:00", over: false });
		expect(timerDisplay(run, plan, 9 * min + 1000).over).toBe(true);
	});

	it("fin de semana en orden", () => {
		expect(weekendTimerPlan({}).map((i) => i.key)).toEqual(["song:talk", "prayer:opening", "talk", "song:watchtower", "watchtower", "song:closing", "prayer:closing"]);
		expect(weekendTimerPlan({ watchtowerFirst: true }).map((i) => i.key)).toEqual([
			"song:watchtower", "prayer:opening", "watchtower", "song:closing", "talk", "song:talk", "prayer:closing",
		]);
		const normal = weekendTimerPlan({ closingSongNumber: 12, closingSongTitle: "Gran Dios" });
		expect(normal.at(-2)!).toMatchObject({ title: "Canción 12: Gran Dios", minutes: 5 });
		expect(normal.at(-1)!).toMatchObject({ title: "Oración", minutes: 2 });
		// 5 + 2 + 30 + 5 + 60 + 5 + 2 = 109 minutos y 6 cambios de 1 minuto.
		const starts = plannedStarts(normal, 0);
		expect(starts.at(-1)! + 2 * min).toBe(115 * min);
		expect(normal.find((i) => i.key === "watchtower")!.minutes).toBe(60);
		const co = { overseerName: "SC", midweekTalk: { title: null, song: null }, publicTalk: { title: null, song: null }, finalTalk: { title: "Final", song: 3 } };
		const visit = weekendTimerPlan({}, co);
		expect(visit.map((i) => i.key)).toEqual(["song:talk", "prayer:opening", "talk", "song:watchtower", "watchtower", "co:final", "song:closing", "prayer:closing"]);
		expect(visit.find((i) => i.key === "watchtower")!.minutes).toBe(30);
	});

	it("entre semana sin sala auxiliar ni oración", () => {
		const d = {
			meeting: {},
			assignments: [
				{ id: "t", sectionType: "treasures_talk", sequenceOrder: 1 },
				{ id: "s1", sectionType: "student_assignment", sequenceOrder: 4, durationMinutes: 3 },
				{ id: "s1x", sectionType: "student_assignment", sequenceOrder: 4, durationMinutes: 3, room: "auxiliary" },
				{ id: "c", sectionType: "cbs", sectionTitle: "Conductor", sequenceOrder: 7 },
				{ id: "r", sectionType: "cbs", sectionTitle: "Lector", sequenceOrder: 8 },
				{ id: "p", sectionType: "prayer", sequenceOrder: 9 },
			],
		};
		const p = midweekTimerPlan(d, (a) => a.sectionType);
		expect(p.map((i) => i.key)).toEqual(["song:opening", "prayer:opening", "intro", "t", "s1", "song:middle", "c", "conclusion", "song:closing", "prayer:closing"]);
		expect(p[0]).toMatchObject({ minutes: 5, title: "Canción" });
		expect(p[1]).toMatchObject({ minutes: 2, title: "Oración" });
		expect(p[3].minutes).toBe(10);
		expect(p[6]).toMatchObject({ minutes: 30, title: "Estudio bíblico de la congregación" });
		// Cada paso con su minuto de cambio: 5+2+1+10+3+5+30+3+5+2 = 66 y 9 cambios.
		expect(plannedStarts(p, 0).at(-1)! + 2 * min).toBe(75 * min);
		// Sin oración inicial: no hay esa oración.
		expect(midweekTimerPlan({ ...d, skipOpeningPrayer: true }, (a) => a.id).map((i) => i.key)).not.toContain("prayer:opening");
		// Visita: el discurso de servicio reemplaza al estudio y la canción final es la del superintendente.
		const co = { overseerName: "SC", midweekTalk: { title: "Servicio", song: 44 }, publicTalk: { title: null, song: null }, finalTalk: { title: null, song: null } };
		const v = midweekTimerPlan({ ...d, coVisit: co }, (a) => a.id);
		expect(v.map((i) => i.key)).toEqual(["song:opening", "prayer:opening", "intro", "t", "s1", "song:middle", "co:service", "conclusion", "song:closing", "prayer:closing"]);
		expect(v.at(-2)!.title).toBe("Canción 44");
	});

	it("quién puede usarlo", () => {
		const base = { id: "u1", privilegeCodes: [], appointmentTypes: [] };
		expect(canTimeMeeting(base, "otro")).toBe(false);
		expect(canTimeMeeting(base, null)).toBe(false);
		expect(canTimeMeeting(base, "u1")).toBe(true);
		expect(canTimeMeeting({ ...base, privilegeCodes: ["meeting_timer"] }, null)).toBe(true);
		expect(canTimeMeeting({ ...base, appointmentTypes: ["auxiliary_counselor"] }, null)).toBe(true);
	});

	it("lee lo guardado solo si es válido", () => {
		const run = startRun(plan, 5);
		expect(parseRun(JSON.stringify(run))).toEqual(run);
		expect(parseRun("{")).toBeNull();
		expect(parseRun('{"taps":[]}')).toBeNull();
		expect(parseRun(null)).toBeNull();
	});

	it("día y hora de la reunión debajo de la pestaña", () => {
		expect(meetingWhen({ day: "Jueves", time: "19:00" })).toBe("jue, 07:00 p. m.");
		expect(meetingWhen({ day: "miércoles", time: "9:30" })).toBe("mié, 09:30 a. m.");
		expect(meetingWhen({ day: "Sábado", time: null })).toBe("sáb");
		expect(meetingWhen({ day: null, time: "12:15", cancelledBy: "Asamblea" })).toBe("Asamblea");
		expect(meetingWhen(null)).toBeNull();
	});
});
