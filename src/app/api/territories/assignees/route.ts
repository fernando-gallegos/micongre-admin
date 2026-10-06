import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { territoryErrorResponse } from "@/lib/territories/http";
import { listAssignableUsers } from "@/lib/territories/service";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const kind = new URL(request.url).searchParams.get("kind") === "public_preaching" ? "public_preaching" : "general";
		return NextResponse.json({ items: await listAssignableUsers(getDb(), kind) });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
