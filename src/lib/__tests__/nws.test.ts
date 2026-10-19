import { describe, expect, it } from "vitest";
import { buildNwsImport, detectNwsKind, NwsError, parseCsv, parseNwsFiles } from "@/lib/setup/nws";

describe("CSV de NWScheduler", () => {
	it("lee comillas, comillas escapadas, saltos de línea dentro de comillas y BOM", () => {
		const { headers, rows } = parseCsv('﻿A,B\n"uno, dos","con ""comillas""\ny salto"\n');
		expect(headers).toEqual(["A", "B"]);
		expect(rows).toEqual([{ A: "uno, dos", B: 'con "comillas"\ny salto' }]);
	});
	it("reconoce cada archivo por sus columnas, no por el nombre", () => {
		expect(detectNwsKind(["PersonID", "FirstName", "LastName", "Privilege"])).toBe("persons");
		expect(detectNwsKind(["PublisherID", "Relationship"])).toBe("emergency");
		expect(detectNwsKind(["SharedInMinistry", "BibleStudies", "FirstName", "LastName"])).toBe("reports");
		expect(detectNwsKind(["OutlineNumber", "PublicSpeaker", "Date"])).toBe("program");
		expect(detectNwsKind(["Otra", "Cosa"])).toBeNull();
		expect(parseNwsFiles(["X,Y\n1,2\n"]).unrecognized).toBe(1);
	});
	it("sin el archivo de Personas no importa nada", () => {
		expect(() => buildNwsImport({})).toThrowError(NwsError);
	});
	it("arma sentencias para las personas", () => {
		const { bundle } = parseNwsFiles(["PersonID,FirstName,LastName,Privilege\n1,Ana,López,Publisher\n2,Luis,Pérez,Elder\n"]);
		const result = buildNwsImport(bundle, new Date("2026-10-18T12:00:00Z"));
		expect(result.statements.length).toBeGreaterThan(0);
		expect(result.statements.join("\n")).toContain("Ana");
	});
});
