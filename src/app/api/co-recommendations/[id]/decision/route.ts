import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coRecommendations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCoVisitDossier } from "@/lib/rbac/guards";
import { updateRecommendationDecisionSchema } from "@/lib/validation/coVisit";

// Única escritura permitida al SC (además de admin) en todo el módulo — el
// resto del paquete S-61/S-62 es de solo lectura para su privilegio temporal.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitDossier(session);
		const { id } = await params;

		const parsed = updateRecommendationDecisionSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		await db.update(coRecommendations).set(parsed.data).where(eq(coRecommendations.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
