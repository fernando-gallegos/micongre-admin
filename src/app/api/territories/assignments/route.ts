import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { territoryErrorResponse } from "@/lib/territories/http";
import { listAssignments } from "@/lib/territories/service";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		return NextResponse.json({ items: await listAssignments(getDb()) });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
