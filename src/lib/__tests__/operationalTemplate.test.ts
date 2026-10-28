import { describe, expect, it } from "vitest";
import { findDuplicatePosition, planSlotSync, type ExistingSlot } from "@/lib/operational/template";

let n = 0;
function row(privilegeId: string, position: string | null, assignedUserId: string | null = null): ExistingSlot {
	return { id: `r${++n}`, meetingId: "m", privilegeId, position, assignedUserId };
}

describe("plantilla de puestos operativos", () => {
	it("una reunión vacía recibe todos los puestos de la plantilla, con repetidos", () => {
		const plan = planSlotSync(
			[{ privilegeId: "entrada", position: null }, { privilegeId: "entrada", position: null }, { privilegeId: "audio", position: "Consola" }],
			[],
		);
		expect(plan.insert).toHaveLength(3);
		expect(plan.remove).toEqual([]);
	});

	it("agrega solo lo que falta y quita lo que no está en la plantilla si nadie lo ocupa", () => {
		const entrada = row("entrada", null);
		const extra = row("banos", null);
		const ocupado = row("estacionamiento", null, "u1");
		const plan = planSlotSync(
			[{ privilegeId: "entrada", position: null }, { privilegeId: "entrada", position: null }],
			[entrada, extra, ocupado],
		);
		expect(plan.insert).toEqual([{ privilegeId: "entrada", position: null }]);
		expect(plan.remove).toEqual([extra.id]);
	});

	it("con más puestos de los que pide la plantilla quita primero los libres y nunca uno ocupado", () => {
		const a = row("entrada", null, "u1");
		const b = row("entrada", null);
		const c = row("entrada", null, "u2");
		const plan = planSlotSync([{ privilegeId: "entrada", position: null }], [a, b, c]);
		expect(plan.insert).toEqual([]);
		expect(plan.remove).toEqual([b.id]);
	});

	it("el nombre del puesto distingue (sin importar espacios) y uno vacío equivale a sin nombre", () => {
		const plan = planSlotSync(
			[{ privilegeId: "entrada", position: " Puerta izquierda " }, { privilegeId: "audio", position: "" }],
			[row("entrada", "Puerta izquierda"), row("audio", null)],
		);
		expect(plan).toEqual({ insert: [], remove: [] });
	});

	it("detecta un mismo nombre de puesto repetido en la misma tarea, pero no los que no tienen nombre", () => {
		expect(findDuplicatePosition([{ privilegeId: "a", position: null }, { privilegeId: "a", position: null }])).toBeNull();
		expect(findDuplicatePosition([{ privilegeId: "a", position: "X" }, { privilegeId: "b", position: "X" }])).toBeNull();
		expect(findDuplicatePosition([{ privilegeId: "a", position: "X" }, { privilegeId: "a", position: " X" }])?.position).toBe(" X");
	});
});
