import { describe, expect, it } from "vitest";
import { clampProjectHours, maxProjectHours } from "@/lib/reports/projectHours";
import { groupReportRows, NO_GROUP_NAME, showProjectColumn, type GroupReportRow } from "@/lib/reports/groups";

function row(over: Partial<GroupReportRow>): GroupReportRow {
	return {
		userId: crypto.randomUUID(), fullName: "Persona", groupId: null, groupName: null, reportId: null,
		participatedInMinistry: null, isAuxiliaryPioneerThisMonth: null, hours: null, projectHours: null,
		bibleStudiesCount: null, comments: null, creditHoursNote: null, pioneerType: null, ...over,
	};
}

describe("horas de proyectos", () => {
	it("el tope es 55 menos las horas de servicio", () => {
		expect(maxProjectHours(40)).toBe(15);
		expect(maxProjectHours(null)).toBe(55);
	});
	it("recorta al máximo y deja vacío cuando no hay cupo o no hay valor", () => {
		expect(clampProjectHours(50, 10)).toBe(5);
		expect(clampProjectHours(30, 10)).toBe(10);
		expect(clampProjectHours(55, 3)).toBeNull();
		expect(clampProjectHours(60, 3)).toBeNull();
		expect(clampProjectHours(20, 0)).toBeNull();
		expect(clampProjectHours(20, null)).toBeNull();
	});
});

describe("informes por grupo", () => {
	it("ordena los grupos alfabéticamente (números en orden natural) y deja «Sin grupo» al final", () => {
		const groups = groupReportRows([
			row({ fullName: "Ana", groupId: "g10", groupName: "Grupo 10" }),
			row({ fullName: "Beto" }),
			row({ fullName: "Carla", groupId: "g2", groupName: "Grupo 2" }),
			row({ fullName: "Dina", groupId: "g10", groupName: "Grupo 10" }),
		]);
		expect(groups.map((g) => g.name)).toEqual(["Grupo 2", "Grupo 10", NO_GROUP_NAME]);
		expect(groups[1].items.map((i) => i.fullName)).toEqual(["Ana", "Dina"]);
		expect(groups[2].id).toBeNull();
	});
	it("una persona con grupo borrado (sin nombre) cae en «Sin grupo»", () => {
		const groups = groupReportRows([row({ groupId: "borrado", groupName: null })]);
		expect(groups).toHaveLength(1);
		expect(groups[0].name).toBe(NO_GROUP_NAME);
	});
	it("la columna de proyectos sale con un precursor regular o con horas de proyecto guardadas", () => {
		expect(showProjectColumn([row({}), row({ pioneerType: "auxiliary_pioneer" })])).toBe(false);
		expect(showProjectColumn([row({ pioneerType: "regular_pioneer" })])).toBe(true);
		expect(showProjectColumn([row({ projectHours: 4 })])).toBe(true);
	});
});
