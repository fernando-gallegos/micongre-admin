import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/export/builders/meetingDates";

const month = (date: string) => parseRange(new URLSearchParams({ date, scope: "month" }));

describe("parseRange (mes = semanas cuyo lunes cae en el mes)", () => {
	it("la semana del lunes 30 de noviembre de 2026 cuenta en noviembre", () => {
		const nov = month("2026-11-30");
		expect(nov).toMatchObject({ from: "2026-11-02", to: "2026-12-06", label: "noviembre de 2026", slug: "2026-11" });
		// El sábado 5 de diciembre de esa semana queda en noviembre, no en diciembre.
		expect(month("2026-12-07")).toMatchObject({ from: "2026-12-07", to: "2027-01-03" });
	});

	it("un mes que empieza en lunes empieza ese día", () => {
		expect(month("2027-02-10")).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
	});

	it("la semana sigue siendo de lunes a domingo", () => {
		expect(parseRange(new URLSearchParams({ date: "2026-12-03", scope: "week" }))).toMatchObject({ from: "2026-11-30", to: "2026-12-06" });
	});
});

describe("parseRange (rango de fechas)", () => {
	const range = (from: string, to: string) => parseRange(new URLSearchParams({ scope: "range", from, to, date: "2026-01-01" }));

	it("toma los días elegidos, incluidos", () => {
		expect(range("2026-12-02", "2027-01-03")).toMatchObject({
			from: "2026-12-02",
			to: "2027-01-03",
			scope: "range",
			label: "2 de diciembre de 2026 al 3 de enero de 2027",
			slug: "2026-12-02_2027-01-03",
		});
		expect(range("2026-12-02", "2026-12-20").label).toBe("2 al 20 de diciembre de 2026");
		expect(range("2026-12-05", "2026-12-05").label).toBe("5 de diciembre de 2026");
	});

	it("si vienen al revés los ordena, y no pasa de unos 6 meses", () => {
		expect(range("2026-12-20", "2026-12-02")).toMatchObject({ from: "2026-12-02", to: "2026-12-20" });
		expect(range("2026-01-01", "2027-12-31").to).toBe("2026-07-05");
	});

	it("sin fechas válidas vuelve a la semana", () => {
		expect(parseRange(new URLSearchParams({ scope: "range", from: "x", date: "2026-12-03" }))).toMatchObject({ scope: "week", from: "2026-11-30" });
	});
});
