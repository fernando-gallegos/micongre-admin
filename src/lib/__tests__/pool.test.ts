import { describe, expect, it } from "vitest";
import { mapWithLimit } from "@/lib/http/pool";

describe("mapWithLimit", () => {
	it("respeta el orden y nunca pasa del límite", async () => {
		let running = 0;
		let peak = 0;
		const out = await mapWithLimit([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((r) => setTimeout(r, n));
			running--;
			return n * 2;
		});
		expect(out).toEqual([10, 2, 8, 4, 6, 0, 12]);
		expect(peak).toBeLessThanOrEqual(3);
	});

	it("con la lista vacía no hace nada", async () => {
		expect(await mapWithLimit([], 4, async () => 1)).toEqual([]);
	});
});
