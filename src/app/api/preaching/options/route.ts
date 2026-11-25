import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, fieldServiceGroups } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { preachingErrorResponse } from "@/lib/preaching/http";
import { listAssignablePeople, listAssignableTerritories, loadDepartures } from "@/lib/preaching/service";
import { listDayCaptains } from "@/lib/preaching/captains";
import { listAssignableUsers, listTerritories } from "@/lib/territories/service";
import { assertCanAccessPreachingModule } from "@/lib/rbac/guards";

// Lo que el formulario ofrece: territorios con asignación vigente, grupos activos y personas.
export async function GET() {
	try {
		assertCanAccessPreachingModule(await getSession());
		const db = getDb();
		const [cong] = await db.select({ time: congregations.preachingTime }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
		const [territories, groups, people, captains, allTerritories, captainsGeneral, captainsPublic] = await Promise.all([
			listAssignableTerritories(db),
			db
				.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name, color: fieldServiceGroups.color })
				.from(fieldServiceGroups)
				.where(eq(fieldServiceGroups.active, true))
				.orderBy(asc(fieldServiceGroups.name)),
			listAssignablePeople(db),
			listDayCaptains(db),
			listTerritories(db),
			listAssignableUsers(db, "general"),
			listAssignableUsers(db, "public_preaching"),
		]);
		// Puntos de salida de cada territorio, para elegir el de la salida.
		const departures = await loadDepartures(db, [...territories.map((t) => t.id), ...allTerritories.map((t) => t.id)]);
		return NextResponse.json({
			territories: territories.map((t) => ({ ...t, departures: departures.get(t.id) ?? [] })),
			groups,
			people,
			defaultTime: cong?.time ?? "09:00",
			// Flujo 2 («capitán fijo por día»): los capitanes fijos, todos los territorios (con quién los tiene ahora) y a quién se puede
			// poner de suplente por tipo.
			captains,
			allTerritories: allTerritories.map((t) => ({
				id: t.id,
				number: t.number,
				name: t.name,
				kind: t.kind,
				assigneeName: t.current?.assigneeName ?? null,
				assigneeUserId: t.current?.assigneeUserId ?? null,
				departures: departures.get(t.id) ?? [],
			})),
			captainCandidates: { general: captainsGeneral, public_preaching: captainsPublic },
		});
	} catch (error) {
		return preachingErrorResponse(error);
	}
}
