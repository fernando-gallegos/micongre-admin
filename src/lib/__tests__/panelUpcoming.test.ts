import { describe, expect, it } from "vitest";
import { isOver, nextTerritorySession, nicaraguaNow, selectUpcoming, territoryVisible, untilOf } from "@/lib/panel/upcoming";
import type { PanelAssignment } from "@/lib/queries/panel";

const w = { today: "2026-11-03", weekStart: "2026-11-02", weekEnd: "2026-11-08" };
const a = (over: Partial<PanelAssignment> & Pick<PanelAssignment, "date" | "meetingType" | "label">): PanelAssignment => ({ ...over });
const labels = (list: PanelAssignment[]) => list.map((x) => x.label);

describe("Mis asignaciones: solo lo que sigue", () => {
	it("de las reuniones muestra todo lo de la siguiente de cada tipo (partes y acomodadores)", () => {
		const out = selectUpcoming(
			[
				a({ date: "2026-11-09", meetingType: "midweek", label: "Lectura", bucket: "meeting:midweek" }),
				a({ date: "2026-11-09", meetingType: "operational", label: "Micrófono 1", bucket: "meeting:midweek" }),
				a({ date: "2026-11-16", meetingType: "midweek", label: "Oración", bucket: "meeting:midweek" }),
				a({ date: "2026-11-07", meetingType: "weekend", label: "Presidente", bucket: "meeting:weekend" }),
				a({ date: "2026-11-14", meetingType: "operational", label: "Plataforma", bucket: "meeting:weekend" }),
			],
			w,
		);
		expect(labels(out)).toEqual(["Presidente", "Lectura", "Micrófono 1"]);
	});

	it("de lo demás solo el siguiente de cada tipo; predicación pública aparte de la de la congregación", () => {
		const out = selectUpcoming(
			[
				a({ date: "2026-11-04", meetingType: "cleaning", label: "Limpieza 1" }),
				a({ date: "2026-11-11", meetingType: "cleaning", label: "Limpieza 2" }),
				a({ date: "2026-11-05", meetingType: "preaching", label: "Congregación 1", bucket: "preaching:group", territoryIds: ["t9"] }),
				a({ date: "2026-11-06", meetingType: "preaching", label: "Congregación 2", bucket: "preaching:group", territoryIds: ["t9"] }),
				a({ date: "2026-11-07", meetingType: "preaching", label: "Pública 1", bucket: "preaching:public", territoryIds: ["p1"] }),
				a({ date: "2026-11-14", meetingType: "preaching", label: "Pública 2", bucket: "preaching:public", territoryIds: ["p1"] }),
			],
			w,
		);
		expect(labels(out)).toEqual(["Limpieza 1", "Congregación 1", "Pública 1"]);
	});

	it("el capitán ve su territorio como su predicación (hora y territorio) y al tocarlo abre ese día; la salida no se repite", () => {
		const out = selectUpcoming(
			[
				a({
					date: "2026-10-20",
					meetingType: "territory",
					label: "Territorio 4",
					territory: { assignmentId: "a", territoryId: "t4", status: "assigned", comment: null },
					nextSessionAt: { date: "2026-11-05", time: "08:45" },
				}),
				a({ date: "2026-11-05", time: "08:45", meetingType: "preaching", label: "Salida t4", bucket: "preaching:group", territoryIds: ["t4"], timeLabel: "8:45 a.m." }),
				a({ date: "2026-11-12", time: "08:45", meetingType: "preaching", label: "Salida t4 b", bucket: "preaching:group", territoryIds: ["t4"] }),
			],
			w,
		);
		expect(labels(out)).toEqual(["Predicación: 8:45 a.m. Territorio 4"]);
		expect(out[0]).toMatchObject({ openDate: "2026-11-05", until: "2026-11-05T10:45" });
		expect(out[0]).not.toHaveProperty("bucket");
		expect(out[0]).not.toHaveProperty("nextSessionAt");
	});

	it("discursos: todos los de esta semana (o el siguiente) y quienes salen, solo esta semana", () => {
		const out = selectUpcoming(
			[
				a({ date: "2026-11-07", meetingType: "outgoing_talk", label: "Mi discurso A" }),
				a({ date: "2026-11-08", meetingType: "outgoing_talk", label: "Mi discurso B" }),
				a({ date: "2026-11-15", meetingType: "outgoing_talk", label: "Mi discurso C" }),
				a({ date: "2026-11-08", meetingType: "outgoing_talk", label: "Sale Juan", bucket: "talks_out" }),
			],
			w,
		);
		expect(labels(out)).toEqual(["Mi discurso A", "Mi discurso B", "Sale Juan"]);
		const later = selectUpcoming([a({ date: "2026-11-15", meetingType: "outgoing_talk", label: "C" }), a({ date: "2026-11-22", meetingType: "outgoing_talk", label: "D" })], w);
		expect(labels(later)).toEqual(["C"]);
	});
});

describe("isOver (pasa al historial al terminar)", () => {
	const now = { date: "2026-11-05", minutes: 13 * 60 }; // jueves 1:00 p. m.
	it("la predicación de hoy a las 8:45 ya pasó a la 1 p. m.; la de las 12:00 todavía no (dura 2 h)", () => {
		expect(isOver({ date: "2026-11-05", time: "08:45", meetingType: "preaching" }, now)).toBe(true);
		expect(isOver({ date: "2026-11-05", time: "12:00", meetingType: "preaching" }, now)).toBe(false);
	});
	it("la reunión pasa al terminar (1 h 45)", () => {
		expect(isOver({ date: "2026-11-05", time: "11:00", meetingType: "midweek" }, now)).toBe(true);
		expect(isOver({ date: "2026-11-05", time: "19:00", meetingType: "midweek" }, now)).toBe(false);
	});
	it("sin hora o de varios días sigue siendo de hoy; lo de ayer ya pasó y lo de mañana no", () => {
		expect(isOver({ date: "2026-11-05", meetingType: "cleaning" }, now)).toBe(false);
		expect(isOver({ date: "2026-11-02", dateEnd: "2026-11-08", meetingType: "cleaning" }, now)).toBe(false);
		expect(isOver({ date: "2026-11-04", time: "23:00", meetingType: "preaching" }, now)).toBe(true);
		expect(isOver({ date: "2026-11-06", time: "08:00", meetingType: "preaching" }, now)).toBe(false);
	});
	it("nicaraguaNow resta 6 horas a UTC", () => {
		expect(nicaraguaNow(new Date("2026-11-05T19:30:00Z"))).toEqual({ date: "2026-11-05", minutes: 13 * 60 + 30 });
		expect(nicaraguaNow(new Date("2026-11-06T02:00:00Z"))).toEqual({ date: "2026-11-05", minutes: 20 * 60 });
	});
});

describe("untilOf", () => {
	it("hora de inicio + duración, pasando al día siguiente si hace falta", () => {
		expect(untilOf({ date: "2026-11-05", time: "08:45", meetingType: "preaching" })).toBe("2026-11-05T10:45");
		expect(untilOf({ date: "2026-11-05", time: "23:00", meetingType: "preaching" })).toBe("2026-11-06T01:00");
		expect(untilOf({ date: "2026-11-05", meetingType: "cleaning" })).toBeUndefined();
	});
});

describe("territorio pendiente en Mi Panel", () => {
	it("sale solo desde el día antes de su siguiente salida; sin salida, no sale", () => {
		expect(territoryVisible({ date: "2026-11-20" }, "2026-11-18")).toBe(false);
		expect(territoryVisible({ date: "2026-11-20" }, "2026-11-19")).toBe(true);
		expect(territoryVisible({ date: "2026-11-20" }, "2026-11-20")).toBe(true);
		expect(territoryVisible({ date: "2026-12-01" }, "2026-11-30")).toBe(true);
		expect(territoryVisible(undefined, "2026-11-18")).toBe(false);
	});

	it("la salida que toca es la primera que no ha terminado (2 horas después de su hora)", () => {
		const sessions = [
			{ date: "2026-11-28", time: "08:45" },
			{ date: "2026-11-05", time: "08:45" },
		];
		expect(nextTerritorySession(sessions, { date: "2026-11-05", minutes: 10 * 60 + 30 })).toEqual({ date: "2026-11-05", time: "08:45" });
		expect(nextTerritorySession(sessions, { date: "2026-11-05", minutes: 10 * 60 + 45 })).toEqual({ date: "2026-11-28", time: "08:45" });
		expect(nextTerritorySession(sessions, { date: "2026-11-29", minutes: 0 })).toBeUndefined();
		// El 25 la siguiente es la del 28: todavía no se muestra (solo desde el 27).
		expect(territoryVisible(nextTerritorySession(sessions, { date: "2026-11-25", minutes: 0 }), "2026-11-25")).toBe(false);
	});
});
