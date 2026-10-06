import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { households, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { assertCanAccessHouseholdsModule, getOwnFieldServiceGroupId } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { createHouseholdSchema } from "@/lib/validation/households";

// Hogares: agrupación ligera de publicadores, usada únicamente por la regla
// S-38 §7,8,10 (el ayudante de una asignación de estudiante debe ser del
// mismo sexo o familiar — "familiar" = mismo household_id).
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessHouseholdsModule(session);

		const db = getDb();
		const [householdRows, memberRows] = await Promise.all([
			db.select().from(households).orderBy(asc(households.label)),
			db
				.select({
					id: users.id,
					fullName: users.fullName,
					householdId: users.householdId,
					fieldServiceGroupId: users.fieldServiceGroupId,
				})
				.from(users)
				.where(notHiddenAdmin),
		]);

		// "Hogares del grupo" (sin admin ni "Todos los hogares"): acotar a los
		// hogares que tengan algún miembro del grupo de servicio propio — más los
		// hogares sin ningún miembro todavía, que se muestran a cualquiera con
		// acceso al módulo porque aún no se sabe de qué grupo son.
		let visibleHouseholdRows = householdRows;
		if (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_ALL)) {
			const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
			const groupHouseholdIds = new Set(
				memberRows.filter((m) => m.fieldServiceGroupId === ownGroupId).map((m) => m.householdId),
			);
			const householdIdsWithAnyMember = new Set(memberRows.map((m) => m.householdId));
			visibleHouseholdRows = householdRows.filter(
				(h) => groupHouseholdIds.has(h.id) || !householdIdsWithAnyMember.has(h.id),
			);
		}

		const items = visibleHouseholdRows.map((h) => ({
			...h,
			members: memberRows.filter((m) => m.householdId === h.id).map(({ id, fullName }) => ({ id, fullName })),
		}));

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessHouseholdsModule(session);

		const parsed = createHouseholdSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db.insert(households).values(parsed.data).returning({ id: households.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
