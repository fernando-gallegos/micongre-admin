import { describe, expect, it } from "vitest";
import { ANNOUNCEMENTS } from "@/lib/announcements/catalog";
import { pendingAnnouncements, type Announcement } from "@/lib/announcements/rules";

const a = (id: string, audience: Announcement["audience"], published = true): Announcement => ({ id, audience, published, title: id, items: [] });
const catalog = [a("todos", "all"), a("nombrados", "appointed"), a("admins", "admins"), a("borrador", "all", false)];
const ids = (list: Announcement[]) => list.map((x) => x.id);

describe("pendingAnnouncements", () => {
	it("cada nivel ve solo lo suyo y nunca lo que no está publicado", () => {
		expect(ids(pendingAnnouncements(catalog, { isAdmin: false, isAppointed: false }, []))).toEqual(["todos"]);
		expect(ids(pendingAnnouncements(catalog, { isAdmin: false, isAppointed: true }, []))).toEqual(["todos", "nombrados"]);
		expect(ids(pendingAnnouncements(catalog, { isAdmin: true, isAppointed: false }, []))).toEqual(["todos", "admins"]);
		expect(ids(pendingAnnouncements(catalog, { isAdmin: true, isAppointed: true }, []))).toEqual(["todos", "nombrados", "admins"]);
	});

	it("lo que ya vio no vuelve a salir", () => {
		expect(ids(pendingAnnouncements(catalog, { isAdmin: true, isAppointed: true }, ["todos", "admins"]))).toEqual(["nombrados"]);
	});
});

describe("catálogo de novedades", () => {
	it("los id son únicos y cada novedad tiene título y contenido", () => {
		expect(new Set(ANNOUNCEMENTS.map((x) => x.id)).size).toBe(ANNOUNCEMENTS.length);
		for (const x of ANNOUNCEMENTS) {
			expect(x.title && (x.body?.trim() || (x.items?.length ?? 0) > 0)).toBeTruthy();
			expect((x.items ?? []).every((i) => i.title && i.text)).toBe(true);
			if (x.image) expect(x.image).toMatch(/^\/announcements\/[\w.-]+\.(jpe?g|png|webp)$/);
		}
	});
});

describe("novedades centrales (router)", () => {
	it("lee las publicadas del router y la imagen pasa por esta instalación; sin relay no hay", async () => {
		const { centralAnnouncements } = await import("@/lib/announcements/central");
		expect(await centralAnnouncements({})).toEqual([]);
		const calls: string[] = [];
		const original = globalThis.fetch;
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			calls.push(`${url} ${(init?.headers as Record<string, string>).Authorization}`);
			return new Response(
				JSON.stringify({
					updatedAt: "2026-11-25T00:00:00Z",
					announcements: [{ id: "2026-12-prueba", audience: "all", title: "Hola", image: "foto.jpg", intro: null, body: "**Hola**", items: [] }],
				}),
			);
		}) as typeof fetch;
		try {
			const items = await centralAnnouncements({ PUSH_RELAY_URL: "https://push.example.app/__router/push", PUSH_RELAY_KEY: "c.clave" });
			expect(items).toEqual([
				{ id: "2026-12-prueba", audience: "all", published: true, title: "Hola", image: "/api/announcements/image/foto.jpg", intro: undefined, body: "**Hola**", items: [] },
			]);
			expect(calls).toEqual(["https://push.example.app/__router/catalog/announcements Bearer c.clave"]);
		} finally {
			globalThis.fetch = original;
		}
	});
});
