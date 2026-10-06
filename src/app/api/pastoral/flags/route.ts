import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { pastoralFlags, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAccessPastoralDashboard, getManagedGroupIds } from "@/lib/rbac/guards";
import { createFlagSchema } from "@/lib/validation/pastoralCare";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const db = getDb();
		const rows = await db
			.select({
				id: pastoralFlags.id,
				publisherId: pastoralFlags.publisherId,
				publisherName: users.fullName,
				reason: pastoralFlags.reason,
				createdAt: pastoralFlags.createdAt,
				resolvedAt: pastoralFlags.resolvedAt,
			})
			.from(pastoralFlags)
			.innerJoin(users, eq(users.id, pastoralFlags.publisherId))
			.orderBy(desc(pastoralFlags.createdAt));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

// La responsabilidad de avisar es del superintendente/auxiliar del grupo del
// publicador — no requiere que quien marca sea anciano (a diferencia del
// resto del módulo, que sí exige pastoral_care_access).
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = createFlagSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		if (session.role !== "admin") {
			const [publisher] = await db
				.select({ fieldServiceGroupId: users.fieldServiceGroupId })
				.from(users)
				.where(eq(users.id, parsed.data.publisherId))
				.limit(1);
			const managedGroupIds = await getManagedGroupIds(db, session.userId);
			if (!publisher?.fieldServiceGroupId || !managedGroupIds.includes(publisher.fieldServiceGroupId)) {
				throw new RbacError("Solo puedes marcar publicadores de tu propio grupo de servicio.");
			}
		}

		const [created] = await db
			.insert(pastoralFlags)
			.values({ ...parsed.data, flaggedByUserId: session.userId })
			.returning({ id: pastoralFlags.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
