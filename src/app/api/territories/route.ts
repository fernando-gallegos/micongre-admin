import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { territories } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { invalidBody, territoryErrorResponse } from "@/lib/territories/http";
import { assertNumberFree, listTerritories } from "@/lib/territories/service";
import { createTerritorySchema } from "@/lib/validation/territories";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		return NextResponse.json({ items: await listTerritories(getDb()) });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);

		const parsed = createTerritorySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const db = getDb();
		await assertNumberFree(db, parsed.data.number);
		const [created] = await db.insert(territories).values(parsed.data).returning({ id: territories.id });
		return NextResponse.json({ id: created?.id }, { status: 201 });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
