import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coVisitAuxiliaryPioneers } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCoVisitScheduleModule } from "@/lib/rbac/guards";
import { setAuxiliaryPioneersSchema } from "@/lib/validation/coVisit";

// Mismo patrón "conjunto completo deseado, diff en el servidor" que
// PUT /api/publishers/[id]/appointments.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);
		const { id: visitId } = await params;

		const db = getDb();
		const rows = await db
			.select({ userId: coVisitAuxiliaryPioneers.userId })
			.from(coVisitAuxiliaryPioneers)
			.where(eq(coVisitAuxiliaryPioneers.visitId, visitId));

		return NextResponse.json({ userIds: rows.map((r) => r.userId) });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);
		const { id: visitId } = await params;

		const parsed = setAuxiliaryPioneersSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const desiredIds = new Set(parsed.data.userIds);

		const db = getDb();
		const current = await db
			.select({ userId: coVisitAuxiliaryPioneers.userId })
			.from(coVisitAuxiliaryPioneers)
			.where(eq(coVisitAuxiliaryPioneers.visitId, visitId));
		const currentIds = new Set(current.map((r) => r.userId));

		const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));
		const toAdd = [...desiredIds].filter((id) => !currentIds.has(id));

		if (toRemove.length > 0) {
			await db
				.delete(coVisitAuxiliaryPioneers)
				.where(and(eq(coVisitAuxiliaryPioneers.visitId, visitId), inArray(coVisitAuxiliaryPioneers.userId, toRemove)));
		}
		// Fila por fila — ver nota en api/publishers/[id]/privileges/route.ts
		// sobre el límite de variables ligadas de D1.
		for (const userId of toAdd) {
			await db.insert(coVisitAuxiliaryPioneers).values({ visitId, userId });
		}

		return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length });
	} catch (error) {
		return errorResponse(error);
	}
}
