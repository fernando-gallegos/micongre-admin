import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getCoVisitDossier } from "@/lib/queries/coVisitDossier";
import { assertCanAccessCoVisitDossier } from "@/lib/rbac/guards";

// Mismo par página+API que S-21 (publishers/[id]/s21/page.tsx +
// api/reports/s21/[userId]/route.ts): la página imprimible consulta la BD
// directo, esta ruta expone el mismo agregado en JSON para la futura app móvil.
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessCoVisitDossier(session);

		const db = getDb();
		const dossier = await getCoVisitDossier(db);

		return NextResponse.json(dossier);
	} catch (error) {
		return errorResponse(error);
	}
}
