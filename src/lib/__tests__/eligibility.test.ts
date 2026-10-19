import { describe, expect, it } from "vitest";
import { applyPrivilegeConstraints, isValidAssistantPairing, type EligibilityUserRow } from "@/lib/rbac/eligibility";
import { getStudentPartRule } from "@/lib/rbac/studentParts";

const base = { requiresMale: false, requiresBaptized: false, requiresAdult: false, allowsMinorWithParentalConsent: false };
function person(over: Partial<EligibilityUserRow>): EligibilityUserRow {
	return { id: crypto.randomUUID(), fullName: "Persona", gender: "male", householdId: null, birthDate: "1980-01-01", guardianUserId: null, theocraticStatus: "baptized_publisher", ...over };
}
const names = (rows: { fullName: string }[]) => rows.map((r) => r.fullName);

describe("restricciones duras de un privilegio", () => {
	it("solo hombres", () => {
		const rows = [person({ fullName: "Él" }), person({ fullName: "Ella", gender: "female" })];
		expect(names(applyPrivilegeConstraints({ ...base, requiresMale: true }, rows, "2026-10-18"))).toEqual(["Él"]);
	});
	it("solo bautizados", () => {
		const rows = [person({ fullName: "Bautizado" }), person({ fullName: "No bautizado", theocraticStatus: "unbaptized_publisher" })];
		expect(names(applyPrivilegeConstraints({ ...base, requiresBaptized: true }, rows, "2026-10-18"))).toEqual(["Bautizado"]);
	});
	it("adultos; un menor solo con consentimiento cuando el privilegio lo permite", () => {
		const rows = [
			person({ fullName: "Menor", birthDate: "2015-05-05" }),
			person({ fullName: "Menor con tutor", birthDate: "2015-05-05", guardianUserId: "papá" }),
			person({ fullName: "Adulto" }),
		];
		expect(names(applyPrivilegeConstraints({ ...base, requiresAdult: true }, rows, "2026-10-18"))).toEqual(["Adulto"]);
		expect(names(applyPrivilegeConstraints({ ...base, requiresAdult: true, allowsMinorWithParentalConsent: true }, rows, "2026-10-18"))).toEqual([
			"Menor con tutor",
			"Adulto",
		]);
	});
	it("devuelve solo los datos mínimos para los selectores", () => {
		const [r] = applyPrivilegeConstraints(base, [person({ id: "x", fullName: "X", householdId: "h" })], "2026-10-18");
		expect(r).toEqual({ id: "x", fullName: "X", gender: "male", householdId: "h" });
	});
});

describe("partes de estudiante (S-38)", () => {
	it("ayudante: mismo sexo o mismo hogar", () => {
		expect(isValidAssistantPairing({ gender: "male", householdId: null }, { gender: "male", householdId: null })).toBe(true);
		expect(isValidAssistantPairing({ gender: "male", householdId: "h1" }, { gender: "female", householdId: "h1" })).toBe(true);
		expect(isValidAssistantPairing({ gender: "male", householdId: "h1" }, { gender: "female", householdId: "h2" })).toBe(false);
		expect(isValidAssistantPairing({ gender: "male", householdId: null }, { gender: "female", householdId: null })).toBe(false);
	});
	it("reconoce cada parte por palabra clave, aunque cambie la conjugación", () => {
		expect(getStudentPartRule("Empecemos conversaciones")).toEqual({ requiresMale: false, hasHelper: true });
		expect(getStudentPartRule("Empiece conversaciones")).toEqual({ requiresMale: false, hasHelper: true });
		expect(getStudentPartRule("Explique sus creencias")).toEqual({ requiresMale: true, hasHelper: false });
		expect(getStudentPartRule("Discurso")).toEqual({ requiresMale: true, hasHelper: false });
		expect(getStudentPartRule(null)).toEqual({ requiresMale: false, hasHelper: true });
	});
});
