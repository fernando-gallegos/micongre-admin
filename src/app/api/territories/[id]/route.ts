import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { territories } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessTerritoriesModule } from "@/lib/rbac/guards";
import { hasDisallowedFeatures, parseMapData } from "@/lib/territories/geo";
import { invalidBody, territoryErrorResponse } from "@/lib/territories/http";
import { assertNumberFree, deleteTerritory, getTerritoryWithHistory, TerritoryFailure } from "@/lib/territories/service";
import { updateTerritorySchema } from "@/lib/validation/territories";

type Params = { params: Promise<{ id: string }> };

// Ficha del territorio: datos, dibujo del mapa e historial de asignaciones.
export async function GET(_request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		const { territory, history } = await getTerritoryWithHistory(getDb(), id);
		return NextResponse.json({
			id: territory.id,
			number: territory.number,
			kind: territory.kind,
			name: territory.name,
			notes: territory.notes,
			mapData: parseMapData(territory.mapData),
			history,
		});
	} catch (error) {
		return territoryErrorResponse(error);
	}
}

export async function PATCH(request: Request, { params }: Params) {
	try {
		const session = await getSession();
		assertCanAccessTerritoriesModule(session);
		const { id } = await params;

		const parsed = updateTerritorySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const db = getDb();
		const [existing] = await db
			.select({ id: territories.id, kind: territories.kind, mapData: territories.mapData })
			.from(territories)
			.where(eq(territories.id, id))
			.limit(1);
		if (!existing) throw new TerritoryFailure("territory_not_found");

		// Un territorio de predicación pública solo admite puntos y textos: se
		// revisa el dibujo nuevo, o el ya guardado si solo cambia el tipo.
		const kind = parsed.data.kind ?? existing.kind;
		const finalMap = parsed.data.mapData !== undefined ? parsed.data.mapData : parseMapData(existing.mapData);
		if (finalMap && hasDisallowedFeatures(finalMap, kind)) throw new TerritoryFailure("map_not_allowed");
		if (parsed.data.number !== undefined) await assertNumberFree(db, parsed.data.number, id);

		const { mapData, ...rest } = parsed.data;
		await db
			.update(territories)
			.set({
				...rest,
				...(mapData !== undefined ? { mapData: mapData ? JSON.stringify(mapData) : null } : {}),
				updatedAt: new Date(),
			})
			.where(eq(territories.id, id));
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

		const db = getDb();
		const [existing] = await db.select({ id: territories.id }).from(territories).where(eq(territories.id, id)).limit(1);
		if (!existing) throw new TerritoryFailure("territory_not_found");
		await deleteTerritory(db, id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return territoryErrorResponse(error);
	}
}
