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
