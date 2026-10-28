import { describe, expect, it } from "vitest";
import { updateVisitRequestStatusSchema } from "@/lib/validation/pastoralCare";

describe("postergar un pastoreo", () => {
	it("acepta la nueva fecha en formato AAAA-MM-DD", () => {
		expect(updateVisitRequestStatusSchema.safeParse({ status: "postponed", newDate: "2026-11-03" }).success).toBe(true);
	});
	it("rechaza una fecha mal escrita", () => {
		expect(updateVisitRequestStatusSchema.safeParse({ status: "postponed", newDate: "03/11/2026" }).success).toBe(false);
		expect(updateVisitRequestStatusSchema.safeParse({ status: "postponed", newDate: "dddd-dd-dd" }).success).toBe(false);
	});
	it("sin fecha también vale (solo se marca como postergado)", () => {
		expect(updateVisitRequestStatusSchema.safeParse({ status: "postponed" }).success).toBe(true);
	});
});
