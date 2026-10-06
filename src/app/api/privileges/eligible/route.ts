import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getEligiblePublishers, type EligibleUser } from "@/lib/rbac/eligibility";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";

// Selectores "elegir hermano" en toda la app pegan aquí. Acepta varios
// privilegeId en una sola llamada (?privilegeIds=a,b,c) para que un
// constructor semanal con 7+ secciones no dispare 7+ requests — ver
// "Restricciones de free tier" en el plan. Un no-admin con acceso al módulo
// operativo también lo usa para armar la matriz de tareas de su reunión.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		if (session.role !== "admin") assertCanAccessOperationalModule(session);

		const { searchParams } = new URL(request.url);
		const idsParam = searchParams.get("privilegeIds") ?? searchParams.get("privilegeId") ?? "";
		const privilegeIds = idsParam
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);

		if (privilegeIds.length === 0) {
			return NextResponse.json({ error: "missing_privilege_ids" }, { status: 400 });
		}

		const db = getDb();
		const entries = await Promise.all(
			privilegeIds.map(async (id) => [id, await getEligiblePublishers(db, id)] as [string, EligibleUser[]]),
		);

		return NextResponse.json(Object.fromEntries(entries));
	} catch (error) {
		return errorResponse(error);
	}
}
