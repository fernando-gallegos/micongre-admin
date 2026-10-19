import { describe, expect, it } from "vitest";
import { proposeAssignments, type SlotSpec } from "@/lib/assignments/suggest";
import type { UserStats } from "@/lib/assignments/stats";
import type { EligibleUser } from "@/lib/rbac/eligibility";

const people: EligibleUser[] = [
	{ id: "a", fullName: "Andrés", gender: "male", householdId: null },
	{ id: "b", fullName: "Bruno", gender: "male", householdId: null },
	{ id: "c", fullName: "Carla", gender: "female", householdId: "h1" },
	{ id: "d", fullName: "Diana", gender: "female", householdId: null },
	{ id: "e", fullName: "Esteban", gender: "male", householdId: "h1" },
];
const byId = new Map(people.map((p) => [p.id, p]));

function stats(entries: Record<string, { load: number; types?: Record<string, { count: number; last: string | null }> }>) {
	const map = new Map<string, UserStats>();
	for (const [id, s] of Object.entries(entries)) map.set(id, { load: s.load, byType: new Map(Object.entries(s.types ?? {})) } as UserStats);
	return map;
}

function propose(
	slots: SlotSpec[],
	opts: { stats?: Map<string, UserStats>; hardBusy?: string[]; softBusy?: string[]; eligible?: (p: string) => EligibleUser[]; holders?: Record<string, string[]> } = {},
) {
	return proposeAssignments({
		slots,
		eligible: opts.eligible ?? (() => people),
		stats: opts.stats ?? new Map(),
		hardBusy: opts.hardBusy ?? [],
		softBusy: opts.softBusy,
		person: (id) => byId.get(id),
		appointmentHolders: (t) => new Set(opts.holders?.[t] ?? []),
	});
}

describe("motor de asignación automática", () => {
	it("prefiere a quien menos veces tuvo esa asignación, luego menor carga, luego la última vez más antigua", () => {
		const s = stats({
			a: { load: 1, types: { "midweek:prayer": { count: 2, last: "2026-09-01" } } },
			b: { load: 5, types: { "midweek:prayer": { count: 1, last: "2026-09-10" } } },
			c: { load: 2, types: { "midweek:prayer": { count: 1, last: "2026-08-01" } } },
			d: { load: 2, types: { "midweek:prayer": { count: 1, last: "2026-09-20" } } },
			e: { load: 9, types: { "midweek:prayer": { count: 3, last: "2026-07-01" } } },
		});
		const [p] = propose([{ key: "x", label: "Oración", privilegeId: "p", typeKey: "midweek:prayer" }], { stats: s });
		expect(p.candidates.map((c) => c.id)).toEqual(["c", "d", "b", "a", "e"]);
		expect(p.suggestion?.id).toBe("c");
	});
	it("nunca propone a la misma persona dos veces en la reunión ni a quien ya tiene algo en ella", () => {
		const slots: SlotSpec[] = [
			{ key: "1", label: "Uno", privilegeId: "p", typeKey: "t1" },
			{ key: "2", label: "Dos", privilegeId: "p", typeKey: "t2" },
			{ key: "3", label: "Tres", privilegeId: "p", typeKey: "t3" },
		];
		const chosen = propose(slots, { hardBusy: ["a"] }).map((r) => r.suggestion?.id);
		expect(new Set(chosen).size).toBe(3);
		expect(chosen).not.toContain("a");
	});
	it("quien está ocupado en otro módulo queda al final y marcado", () => {
		const [p] = propose([{ key: "x", label: "X", privilegeId: "p", typeKey: "t" }], { softBusy: ["a", "b", "c", "d"] });
		expect(p.suggestion?.id).toBe("e");
		expect(p.candidates.at(-1)?.busy).toBe(true);
	});
	it("partes solo para hombres", () => {
		const [p] = propose([{ key: "x", label: "Discurso", privilegeId: "p", typeKey: "t", maleOnly: true }]);
		expect(p.candidates.every((c) => byId.get(c.id)!.gender === "male")).toBe(true);
	});
	it("el ayudante forma pareja con el principal (mismo sexo o mismo hogar)", () => {
		const result = propose(
			[
				{ key: "main", label: "Principal", privilegeId: "p", typeKey: "student" },
				{ key: "help", label: "Ayudante", privilegeId: "p", typeKey: "helper", helperOf: { slotKey: "main" } },
			],
			{ eligible: () => [people[2], people[3], people[4]] }, // Carla, Diana y Esteban (Carla y Esteban son del mismo hogar)
		);
		const main = byId.get(result[0].suggestion!.id)!;
		const helper = byId.get(result[1].suggestion!.id)!;
		expect(main.id).not.toBe(helper.id);
		expect(main.gender === helper.gender || (main.householdId !== null && main.householdId === helper.householdId)).toBe(true);
	});
	it("sin principal no propone ayudante", () => {
		const [, help] = propose(
			[
				{ key: "main", label: "Principal", privilegeId: "p", typeKey: "student" },
				{ key: "help", label: "Ayudante", privilegeId: "p", typeKey: "helper", helperOf: { slotKey: "main" } },
			],
			{ eligible: () => [] },
		);
		expect(help.suggestion).toBeNull();
	});
	it("con nombramiento preferido (conductor de La Atalaya) solo se considera a quien lo tiene", () => {
		const [p] = propose(
			[{ key: "x", label: "Conductor", privilegeId: "p", typeKey: "weekend:watchtower_conductor", preferAppointment: "watchtower_conductor" }],
			{ holders: { watchtower_conductor: ["e"] } },
		);
		expect(p.candidates.map((c) => c.id)).toEqual(["e"]);
	});
	it("avisa cuando nadie es elegible", () => {
		const [p] = propose([{ key: "x", label: "X", privilegeId: "p", typeKey: "t" }], { eligible: () => [] });
		expect(p.suggestion).toBeNull();
		expect(p.note).toMatch(/Nadie elegible/);
	});
});
