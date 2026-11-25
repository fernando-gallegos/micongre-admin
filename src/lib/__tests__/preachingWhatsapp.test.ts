import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage, rangeLabel, whatsappRange, whatsappShareUrl, type WhatsAppSession } from "@/lib/preaching/whatsapp";

const dep = (name: string, address: string | null = null) => ({ fid: name, name, address, lng: 0, lat: 0, isDefault: true });
const s = (date: string, time: string, extra: Partial<WhatsAppSession> = {}): WhatsAppSession => ({
	date,
	time,
	kind: "general",
	territories: [{ number: "12", name: "Colonia Centroamérica", departure: dep("Salón del Reino", "Calle 5") }],
	targets: { congregation: true, groups: [] },
	...extra,
});

describe("rango del mensaje", () => {
	it("entre semana: desde hoy hasta el viernes; el sábado pasa a la próxima", () => {
		expect(whatsappRange("weekday", "2026-11-18", "current")).toEqual({ from: "2026-11-18", to: "2026-11-20" });
		expect(whatsappRange("weekday", "2026-11-21", "current")).toEqual({ from: "2026-11-23", to: "2026-11-27" });
		expect(whatsappRange("weekday", "2026-11-18", "next")).toEqual({ from: "2026-11-23", to: "2026-11-27" });
	});
	it("fin de semana: el sábado y el domingo de esta semana (desde hoy)", () => {
		expect(whatsappRange("weekend", "2026-11-18", "current")).toEqual({ from: "2026-11-21", to: "2026-11-22" });
		expect(whatsappRange("weekend", "2026-11-22", "current")).toEqual({ from: "2026-11-22", to: "2026-11-22" });
		expect(whatsappRange("weekend", "2026-11-22", "next")).toEqual({ from: "2026-11-28", to: "2026-11-29" });
	});
	it("etiqueta", () => {
		expect(rangeLabel("2026-11-17", "2026-11-20", "2026-11-16")).toBe("17 al 20 de noviembre");
		expect(rangeLabel("2026-11-28", "2026-12-02", "2026-11-16")).toBe("28 de noviembre al 2 de diciembre");
		expect(rangeLabel("2026-11-21", "2026-11-21", "2026-11-16")).toBe("21 de noviembre");
		expect(rangeLabel("2026-12-30", "2027-01-02", "2026-12-28")).toBe("30 de diciembre al 2 de enero de 2027");
	});
});

describe("mensaje", () => {
	it("sin salidas, nada", () => {
		expect(buildWhatsAppMessage("weekday", [], "2026-11-16")).toBeNull();
	});
	it("título con el rango de los días con predicación, día, hora, territorio y salida", () => {
		const text = buildWhatsAppMessage(
			"weekday",
			[
				s("2026-11-20", "15:00", { targets: { congregation: false, groups: [{ name: "Grupo 2" }] }, territories: [{ number: "3", name: null, departure: null }] }),
				s("2026-11-17", "09:00"),
			],
			"2026-11-16",
		);
		expect(text).toBe(
			[
				"*Predicación del 17 al 20 de noviembre*",
				"_Entre semana_",
				"",
				"*Martes 17*",
				"🕘 9:00 a.m.",
				"🗺️ Colonia Centroamérica",
				"📍 Salón del Reino — Calle 5",
				"",
				"*Viernes 20*",
				"🕘 3:00 p.m. · Grupo 2",
				"🗺️ Territorio 3",
			].join("\n"),
		);
		expect(whatsappShareUrl("a b")).toBe("https://api.whatsapp.com/send?text=a%20b");
	});
});
