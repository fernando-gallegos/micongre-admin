import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { invalidBody, territoryErrorResponse } from "@/lib/territories/http";
import { assignTerritory, unassignTerritory } from "@/lib/territories/service";
import { assignTerritorySchema } from "@/lib/validation/territories";

type Params = { params: Promise<{ id: string }> };

// Asignar (o cambiar al encargado de) un territorio. No avisa: el aviso sale
// con el botón "Enviar" (POST ./notify).
export async function POST(request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		const parsed = assignTerritorySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		await assignTerritory(getDb(), id, parsed.data.assigneeUserId, session.userId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		await unassignTerritory(getDb(), id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
