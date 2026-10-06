import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { theocraticAppointments } from "@/db/schema";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";

// Precarga el conductor de La Atalaya con quien tiene el nombramiento formal
// "watchtower_conductor" activo (el más antiguo, si hay más de uno) — pero
// solo si sigue siendo elegible para el privilegio (revalida por si el
// nombramiento quedó desactualizado). Se resuelve una sola vez al crear la
// reunión, igual que el sembrado de secciones fijas de entre semana.
export async function getDefaultWatchtowerConductorId(db: Database): Promise<string | null> {
	const [appointee] = await db
		.select({ userId: theocraticAppointments.userId })
		.from(theocraticAppointments)
		.where(and(eq(theocraticAppointments.appointmentType, "watchtower_conductor"), isNull(theocraticAppointments.endDate)))
		.orderBy(asc(theocraticAppointments.startDate))
		.limit(1);
	if (!appointee) return null;

	const eligible = await getEligiblePublishers(db, PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR);
	return eligible.some((u) => u.id === appointee.userId) ? appointee.userId : null;
}
