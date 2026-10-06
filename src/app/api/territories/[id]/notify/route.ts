import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { territoryErrorResponse } from "@/lib/territories/http";
import { notifyAssignee } from "@/lib/territories/service";

// Botón "Enviar" de la asignación: notificación en Mi Panel + push al encargado.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		await notifyAssignee(getDb(), id, session.userId);
		return NextResponse.json({ ok: true, notifiedAt: new Date() });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
