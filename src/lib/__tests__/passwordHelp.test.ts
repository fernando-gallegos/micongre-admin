import { describe, expect, it } from "vitest";
import { findPersonByIdentifier, normalizeName } from "@/lib/auth/passwordHelp";

const people = [
	{ id: "1", fullName: "José Pérez López", username: "jperez" },
	{ id: "2", fullName: "María  Gómez", username: null },
	{ id: "3", fullName: "Ana Ruiz", username: "aruiz" },
	{ id: "4", fullName: "Ana Ruiz", username: "aruiz2" },
];

describe("¿Olvidaste tu contraseña?", () => {
	it("compara nombres sin tildes, mayúsculas ni espacios de más", () => {
		expect(normalizeName("  JOSÉ   pérez López ")).toBe("jose perez lopez");
	});
	it("encuentra por usuario sin importar mayúsculas", () => {
		expect(findPersonByIdentifier(people, "JPerez")?.id).toBe("1");
	});
	it("encuentra por nombre completo aunque no tenga usuario", () => {
		expect(findPersonByIdentifier(people, "maria gomez")?.id).toBe("2");
		expect(findPersonByIdentifier(people, "jose perez lopez")?.id).toBe("1");
	});
	it("con nombres repetidos no adivina, pero el usuario sí identifica", () => {
		expect(findPersonByIdentifier(people, "Ana Ruiz")).toBeNull();
		expect(findPersonByIdentifier(people, "aruiz2")?.id).toBe("4");
	});
	it("nada escrito o sin coincidencia: nadie", () => {
		expect(findPersonByIdentifier(people, "  ")).toBeNull();
		expect(findPersonByIdentifier(people, "Pedro")).toBeNull();
	});
});
