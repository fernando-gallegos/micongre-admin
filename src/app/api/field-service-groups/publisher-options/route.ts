import { and, asc, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessServiceGroupsModule } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

// Para llenar los combos de Superintendente/Auxiliar del modal de "Editar
// grupo" — a propósito NO reutiliza /api/publishers: ese endpoint, para
// alguien sin PUBLISHERS_ALL, fuerza el filtro a su propio grupo de servicio
// (ver src/app/api/publishers/route.ts), lo que dejaba el combo sin la
// opción del superintendente/auxiliar real de un grupo ajeno. Aquí cualquiera
// con acceso al módulo de grupos ve a todos los publicadores, sin paginar.
// `isOverseer`/`isAssistant` indican si tiene vigente el nombramiento de
// superintendente / auxiliar de grupo de servicio (el combo filtra por ellos).
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessServiceGroupsModule(session);

		const db = getDb();
		const [rows, appointmentRows] = await Promise.all([
			db
				.select({ id: users.id, fullName: users.fullName })
				.from(users)
				.where(notHiddenAdmin)
				.orderBy(asc(users.fullName)),
			db
				.select({ userId: theocraticAppointments.userId, appointmentType: theocraticAppointments.appointmentType })
				.from(theocraticAppointments)
				.where(
					and(
						inArray(theocraticAppointments.appointmentType, ["field_service_group_overseer", "field_service_group_assistant"]),
						isNull(theocraticAppointments.endDate),
					),
				),
		]);

		const overseerIds = new Set(
			appointmentRows.filter((a) => a.appointmentType === "field_service_group_overseer").map((a) => a.userId),
		);
		const assistantIds = new Set(
			appointmentRows.filter((a) => a.appointmentType === "field_service_group_assistant").map((a) => a.userId),
		);

		return NextResponse.json({
			items: rows.map((r) => ({ ...r, isOverseer: overseerIds.has(r.id), isAssistant: assistantIds.has(r.id) })),
		});
	} catch (error) {
		return errorResponse(error);
	}
}
