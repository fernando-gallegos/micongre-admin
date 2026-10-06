import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TerritoriesModule } from "@/components/territories/TerritoriesModule";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { canAccessTerritoriesModule } from "@/lib/rbac/guards";

export default async function TerritoriesPage() {
	const session = await getSession();
	if (!canAccessTerritoriesModule(session)) redirect("/panel");

	// La dirección del Salón del Reino centra el mapa mientras un territorio no tiene dibujo.
	const [congregation] = await getDb()
		.select({ address: congregations.kingdomHallAddress })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);

	return <TerritoriesModule hallAddress={congregation?.address ?? null} />;
}
