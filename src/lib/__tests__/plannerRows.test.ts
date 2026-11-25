import { describe, expect, it } from "vitest";
import { mergeRowOrder, numbered } from "@/lib/planner/rows";

const r = (...keys: string[]) => keys.map((key) => ({ key, label: key }));

describe("mergeRowOrder", () => {
	it("junta sin repetir y respeta el orden de cada reunión", () => {
		expect(mergeRowOrder([r("a", "b", "d"), r("a", "c", "d"), r("a", "b", "c", "d", "e")]).map((x) => x.key)).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("una fila nueva al principio queda al principio", () => {
		expect(mergeRowOrder([r("b", "c"), r("a", "b")]).map((x) => x.key)).toEqual(["a", "b", "c"]);
	});

	it("sin reuniones no hay filas", () => {
		expect(mergeRowOrder([])).toEqual([]);
	});
});

describe("numbered", () => {
	it("numera las repeticiones de cada base", () => {
		expect(numbered(["x", "y", "x", "x"], (v) => v).map((v) => v.key)).toEqual(["x#0", "y#0", "x#1", "x#2"]);
	});
});
