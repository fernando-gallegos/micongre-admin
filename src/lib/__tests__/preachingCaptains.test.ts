import { describe, expect, it } from "vitest";
import { captainsForDate, weekdayOf } from "@/lib/preaching/captains";

describe("capitanes fijos por día (flujo 2)", () => {
	it("día de la semana: 1 = lunes … 7 = domingo", () => {
		expect(weekdayOf("2026-11-23")).toBe(1);
		expect(weekdayOf("2026-11-25")).toBe(3);
		expect(weekdayOf("2026-11-29")).toBe(7);
	});

	it("los de esa fecha, de un tipo o de todos; sin capitán ese día = flujo 1", () => {
		const list = [
			{ weekday: 2, kind: "general" as const, userId: "a" },
			{ weekday: 2, kind: "public_preaching" as const, userId: "b" },
			{ weekday: 2, kind: "general" as const, userId: "c" },
			{ weekday: 6, kind: "general" as const, userId: "d" },
		];
		expect(captainsForDate(list, "2026-11-24").map((c) => c.userId)).toEqual(["a", "b", "c"]);
		expect(captainsForDate(list, "2026-11-24", "general").map((c) => c.userId)).toEqual(["a", "c"]);
		expect(captainsForDate(list, "2026-11-29")).toEqual([]);
	});
});
