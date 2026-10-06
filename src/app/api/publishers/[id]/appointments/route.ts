import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { APPOINTMENT_LABELS } from "@/lib/appointmentLabels";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { canManageAppointments } from "@/lib/rbac/guards";
import { SERVICE_COMMITTEE_APPOINTMENTS } from "@/lib/rbac/roles";
import { setAppointmentsSchema } from "@/lib/validation/appointments";

// Mismo patrón que PUT /api/publishers/[id]/privileges: el cliente manda el
// conjunto completo de nombramientos marcados y el servidor calcula el diff
// — abre lo nuevo (start_date = hoy), termina lo destildado (end_date = hoy,
// solo la fila vigente), y no toca lo que ya estaba y sigue marcado.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id: userId } = await params;

		const parsed = setAppointmentsSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const desiredTypes = new Set(parsed.data.appointmentTypes);

		const db = getDb();
		if (!(await canManageAppointments(db, session))) {
			throw new RbacError("Solo el comité de servicio o un administrador puede gestionar nombramientos.");
		}
		const currentlyActive = await db
			.select({ appointmentType: theocraticAppointments.appointmentType })
			.from(theocraticAppointments)
			.where(and(eq(theocraticAppointments.userId, userId), isNull(theocraticAppointments.endDate)));
		const currentTypes = new Set(currentlyActive.map((r) => r.appointmentType));

		const toEnd = [...currentTypes].filter((t) => !desiredTypes.has(t));
		const toStart = [...desiredTypes].filter((t) => !currentTypes.has(t));
		const today = new Date().toISOString().slice(0, 10);

		// Coordinador del cuerpo de ancianos, secretario y superintendente de
		// servicio (sfg 1:10): solo 1 persona puede tener cada uno a la vez —
		// si se asigna a alguien nuevo, se le quita automáticamente a quien ya
		// lo tuviera, con aviso de qué pasó.
		const warnings: string[] = [];
		const committeeToStart = toStart.filter((t) => (SERVICE_COMMITTEE_APPOINTMENTS as readonly string[]).includes(t));
		if (committeeToStart.length > 0) {
			const otherHolders = await db
				.select({
					id: theocraticAppointments.id,
					appointmentType: theocraticAppointments.appointmentType,
					fullName: users.fullName,
				})
				.from(theocraticAppointments)
				.innerJoin(users, eq(users.id, theocraticAppointments.userId))
				.where(
					and(
						inArray(theocraticAppointments.appointmentType, committeeToStart),
						isNull(theocraticAppointments.endDate),
						ne(theocraticAppointments.userId, userId),
					),
				);
			if (otherHolders.length > 0) {
				await db
					.update(theocraticAppointments)
					.set({ endDate: today })
					.where(
						inArray(
							theocraticAppointments.id,
							otherHolders.map((h) => h.id),
						),
					);
				for (const h of otherHolders) {
					warnings.push(
						`Solo una persona puede ser "${APPOINTMENT_LABELS[h.appointmentType] ?? h.appointmentType}" a la vez — se le quitó a ${h.fullName}.`,
					);
				}
			}
		}

		if (toEnd.length > 0) {
			await db
				.update(theocraticAppointments)
				.set({ endDate: today })
				.where(
					and(
						eq(theocraticAppointments.userId, userId),
						isNull(theocraticAppointments.endDate),
						inArray(theocraticAppointments.appointmentType, toEnd),
					),
				);
		}

		// Fila por fila — ver nota en api/publishers/[id]/privileges/route.ts
		// sobre el límite de variables ligadas de D1.
		for (const appointmentType of toStart) {
			await db.insert(theocraticAppointments).values({ userId, appointmentType, startDate: today });
		}

		// Comité de servicio: se resincroniza siempre desde los nombramientos
		// vigentes, sin importar si este publicador en particular era parte del
		// comité — es la única fuente de verdad, ver sfg 1:10.
		if (
			committeeToStart.length > 0 ||
			toEnd.some((t) => (SERVICE_COMMITTEE_APPOINTMENTS as readonly string[]).includes(t))
		) {
			const committeeHolders = await db
				.select({ userId: theocraticAppointments.userId, appointmentType: theocraticAppointments.appointmentType })
				.from(theocraticAppointments)
				.where(
					and(
						inArray(theocraticAppointments.appointmentType, [...SERVICE_COMMITTEE_APPOINTMENTS]),
						isNull(theocraticAppointments.endDate),
					),
				);
			const holderByType: Record<string, string> = Object.fromEntries(
				committeeHolders.map((h) => [h.appointmentType, h.userId]),
			);
			const committeeUpdate = {
				cobeUserId: holderByType.cobe ?? null,
				secretaryUserId: holderByType.secretary ?? null,
				serviceOverseerUserId: holderByType.service_overseer ?? null,
			};

			const [existing] = await db
				.select({ id: congregations.id })
				.from(congregations)
				.where(eq(congregations.id, CONGREGATION_ROW_ID))
				.limit(1);
			if (existing) {
				await db
					.update(congregations)
					.set({ ...committeeUpdate, updatedAt: new Date() })
					.where(eq(congregations.id, CONGREGATION_ROW_ID));
			} else {
				await db.insert(congregations).values({ id: CONGREGATION_ROW_ID, name: "Mi congregación", ...committeeUpdate });
			}
		}

		return NextResponse.json({ ok: true, started: toStart.length, ended: toEnd.length, warnings });
	} catch (error) {
		return errorResponse(error);
	}
}
