import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakers, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { inArray } from "drizzle-orm";

// Publicadores que pueden registrarse como oradores locales: sólo quienes
// tienen el privilegio "Orador de discurso público" (por nombramiento o
// concesión directa) y que aún no están registrados.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const search = new URL(request.url).searchParams.get("search")?.trim().toLowerCase();

		const db = getDb();
		const [eligible, registered] = await Promise.all([
			getEligiblePublishers(db, PRIVILEGE_IDS.PUBLIC_TALK_SPEAKER),
			db.select({ userId: speakers.userId }).from(speakers),
		]);
		const taken = new Set(registered.map((r) => r.userId));
		const candidates = eligible
			.filter((u) => !taken.has(u.id) && (!search || u.fullName.toLowerCase().includes(search)))
			.sort((a, b) => a.fullName.localeCompare(b.fullName));

		const phones = candidates.length
			? await db.select({ id: users.id, phone: users.phone }).from(users).where(inArray(users.id, candidates.map((c) => c.id)))
			: [];
		const phoneById = new Map(phones.map((p) => [p.id, p.phone]));

		return NextResponse.json({
			items: candidates.map((c) => ({ id: c.id, fullName: c.fullName, phone: phoneById.get(c.id) ?? null })),
		});
	} catch (error) {
		return errorResponse(error);
	}
}
