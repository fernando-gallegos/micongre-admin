import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { invalidBody, territoryErrorResponse } from "@/lib/territories/http";
import { adminResolveAssignment, deleteAssignment } from "@/lib/territories/service";
import { adminResolveSchema } from "@/lib/validation/territories";

type Params = { params: Promise<{ id: string }> };

// Quien administra territorios cierra la asignación vigente de otro (completar o devolver).
export async function PATCH(request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		const parsed = adminResolveSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		await adminResolveAssignment(getDb(), id, parsed.data.status, parsed.data.comment);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}

// Cancela una asignación vigente o elimina una del historial.
export async function DELETE(_request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		await deleteAssignment(getDb(), id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
