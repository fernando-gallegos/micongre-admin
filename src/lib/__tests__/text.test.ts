import { describe, expect, it } from "vitest";
import { JwHubError, parseHubUrl } from "@/lib/jw/hub";
import { renderTemplate } from "@/lib/weekend/messageTemplate";
import { effectiveMeetingDate } from "@/lib/attendance/summary";

const LOC = "11111111-2222-3333-4444-555555555555";
const EVT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function hubErrorCode(raw: string): string | null {
	try {
		parseHubUrl(raw);
		return null;
	} catch (error) {
		return error instanceof JwHubError ? error.code : "otro";
	}
}

describe("enlaces del JW Hub", () => {
	it("acepta el enlace de Compartir y la URL del navegador", () => {
		expect(parseHubUrl(`https://hub.jw.org/goto/entry-point/meetings?scope_id=${LOC}&eventId=${EVT}`)).toEqual({ locationId: LOC, eventId: EVT });
		expect(parseHubUrl(`https://hub.jw.org/meetings/es?locationId=${LOC.toUpperCase()}`)).toEqual({ locationId: LOC, eventId: null });
	});
	it("encuentra el enlace dentro del texto completo que copia JW.ORG en el teléfono", () => {
		const text = `Congregación Ejemplo\nJueves 7:00 p. m.\nCalle 1, Ciudad\n\nhttps://hub.jw.org/goto/entry-point/meetings?scope_id=${LOC}&eventId=${EVT}.\n`;
		expect(parseHubUrl(text)).toEqual({ locationId: LOC, eventId: EVT });
	});
	it("avisa claramente cuando es un enlace de búsqueda", () => {
		expect(hubErrorCode('https://hub.jw.org/meetings/es?q={"location":"Managua"}')).toBe("search_link");
	});
	it("rechaza otros dominios y textos sin enlace", () => {
		expect(hubErrorCode(`https://otro.example/meetings?scope_id=${LOC}`)).toBe("invalid_url");
		expect(hubErrorCode("hola")).toBe("invalid_url");
	});
});

describe("plantillas de mensajes para oradores", () => {
	it("reemplaza las palabras clave y omite las líneas cuyas palabras quedaron vacías", () => {
		const body = "Hola {orador}\nDiscurso {bosquejo_numero}: {bosquejo_titulo}\nDirección del salón: {direccion}\n¡Gracias!";
		expect(renderTemplate(body, { orador: "Juan", bosquejo_numero: "12", bosquejo_titulo: "Título", direccion: "" })).toBe(
			"Hola Juan\nDiscurso 12: Título\n¡Gracias!",
		);
	});
	it("deja intactas las llaves que no son palabras clave", () => {
		expect(renderTemplate("Hola {desconocida}", { orador: "Juan" })).toBe("Hola {desconocida}");
	});
});

describe("fecha real de la reunión", () => {
	it("entre semana: el lunes guardado más el día configurado", () => {
		expect(effectiveMeetingDate("2026-10-12", "midweek", { midweek: { day: "Jueves" } })).toBe("2026-10-15");
	});
	it("fin de semana: puede caer en el mes siguiente al sábado guardado", () => {
		expect(effectiveMeetingDate("2026-10-31", "weekend", { weekend: { day: "domingo" } })).toBe("2026-11-01");
	});
	it("sin día configurado se queda con la fecha guardada", () => {
		expect(effectiveMeetingDate("2026-10-31", "weekend", null)).toBe("2026-10-31");
	});
});
