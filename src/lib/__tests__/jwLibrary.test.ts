import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { jwLibraryLink, mwbPartLink, outlineLink, S34_DOC_IDS } from "@/lib/jw/library";
import { parseWeekPrograms } from "@/lib/mwb/parseProgram";
import { mwbLinkFields } from "@/lib/mwb/programRows";

const h3 = (pid: number, n: number, title: string) =>
	`<h3 class="x" id="p${pid}" data-pid="${pid}"><strong>${n}. ${title}</strong></h3><p>(5 mins.)</p><p>Texto de la parte.</p>`;

function fakeMwb(): ArrayBuffer {
	const html = `<html><head><title>2-8 de noviembre</title></head><body>
		<h3><strong>Canción 1</strong></h3>
		<h2><strong>TESOROS DE LA BIBLIA</strong></h2>${h3(5, 1, "Discurso")}${h3(10, 2, "Busquemos perlas escondidas")}${h3(14, 3, "Lectura de la Biblia")}
		<h2><strong>SEAMOS MEJORES MAESTROS</strong></h2>${h3(18, 4, "Empiece conversaciones")}${h3(21, 5, "Haga revisitas")}
		<h2><strong>NUESTRA VIDA CRISTIANA</strong></h2><p>Canción 2</p>${h3(26, 6, "Una parte")}${h3(30, 7, "Estudio bíblico de la congregación")}<p>Canción 3</p>
	</body></html>`;
	const zip = zipSync({ "OEBPS/202026401.xhtml": strToU8(html) });
	return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

describe("enlaces a JW Library", () => {
	it("cada parte numerada de la guía abre su párrafo del documento de la semana", () => {
		const program = parseWeekPrograms(fakeMwb(), ["2026-11-02"]).get("2026-11-02");
		expect(program).toBeDefined();
		expect(program!.docId).toBe(202026401);
		expect(program!.pars).toEqual({ 1: 5, 2: 10, 3: 14, 4: 18, 5: 21, 6: 26, 7: 30 });
		const { mwbDocId, mwbPars } = mwbLinkFields(program!);
		expect(mwbPartLink(mwbDocId, mwbPars, 4)).toBe(jwLibraryLink(202026401, 18));
		expect(mwbPartLink(mwbDocId, mwbPars, null)).toBeNull();
		expect(mwbPartLink(null, mwbPars, 4)).toBeNull();
		expect(mwbPartLink(mwbDocId, "no es json", 4)).toBeNull();
	});

	it("el bosquejo se busca por su número, no por el título", () => {
		expect(Object.keys(S34_DOC_IDS)).toHaveLength(194);
		expect(outlineLink(1)).toBe(jwLibraryLink(1000000));
		expect(outlineLink("76")).toBe(jwLibraryLink(1000178));
		expect(outlineLink(999)).toBeNull();
		expect(outlineLink(null)).toBeNull();
	});

	it("el enlace es el de JW Library (no wol.jw.org)", () => {
		expect(jwLibraryLink(123, 4)).toBe("https://www.jw.org/finder?srcid=jwlshare&wtlocale=S&prefer=lang&docid=123&par=4");
		expect(jwLibraryLink(123)).not.toContain("par=");
	});
});

import { planProgramMerge, type ExistingPart } from "@/lib/mwb/applyProgram";
import { programRows } from "@/lib/mwb/programRows";

describe("actualizar con la guía sin tocar asignaciones", () => {
	const program = parseWeekPrograms(fakeMwb(), ["2026-11-02"]).get("2026-11-02")!;
	const rows = programRows(program);
	const asExisting = (assign: Record<number, string> = {}): ExistingPart[] =>
		rows.map((r, i) => ({ id: `a${i}`, ...r, mainAssigneeId: assign[i] ?? null, assistantAssigneeId: null }));

	it("con todo igual no cambia nada", () => {
		const plan = planProgramMerge(asExisting({ 0: "u1" }), rows);
		expect(plan).toEqual({ updates: [], inserts: [], deletes: [] });
	});

	it("cambia títulos y duración pero nunca quién está asignado", () => {
		const current = asExisting({ 0: "u1" });
		current[0].sectionTitle = "Título viejo";
		current[0].durationMinutes = 8;
		const plan = planProgramMerge(current, rows);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].id).toBe("a0");
		expect(plan.updates[0].set).not.toHaveProperty("mainAssigneeId");
		expect(plan.updates[0].set.sectionTitle).toBe(rows[0].sectionTitle);
	});

	it("una parte que ya no está en la guía se borra solo si no tiene a nadie", () => {
		const extra = (id: string, who: string | null): ExistingPart => ({
			id, sectionType: "student_assignment", sectionTitle: "Sobra", description: null, partNumber: 9, durationMinutes: 3, sequenceOrder: 99, mainAssigneeId: who, assistantAssigneeId: null,
		});
		const plan = planProgramMerge([...asExisting(), extra("libre", null), extra("ocupada", "u2")], rows);
		expect(plan.deletes).toEqual(["libre"]);
		expect(plan.updates.map((u) => u.id)).toEqual(["ocupada"]);
		expect(plan.inserts).toHaveLength(0);
	});

	it("las partes nuevas de la guía se agregan", () => {
		const plan = planProgramMerge(asExisting().filter((p) => p.sectionType !== "student_assignment"), rows);
		expect(plan.inserts.filter((r) => r.sectionType === "student_assignment")).toHaveLength(2);
		expect(plan.deletes).toHaveLength(0);
	});
});
