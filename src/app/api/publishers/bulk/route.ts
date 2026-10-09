import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fieldServiceGroups, theocraticAppointments, userPrivileges, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { applyBulk, applyMatrix, BulkError, bulkSchema, matrixSchema } from "@/lib/publishers/bulk";
import { RbacError } from "@/lib/rbac/errors";
import { canAdministerAccounts, canManageAppointments } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

// Asignación masiva: cada mitad se habilita según el permiso que ya existe para hacerlo de uno en uno — privilegios (admin o
// "Administración de cuentas") y nombramientos (admin o comité de servicio). Se puede tener uno y no el otro.

/** Personas con sus privilegios y nombramientos vigentes, y los permisos de quien pregunta. */
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const db = getDb();
		const canPrivileges = canAdministerAccounts(session);
		const canAppointments = await canManageAppointments(db, session);
		if (!canPrivileges && !canAppointments) throw new RbacError("No tienes permiso para la asignación masiva.");

		const [people, appointments, grants, groups] = await Promise.all([
			db
				.select({
					id: users.id,
					fullName: users.fullName,
					gender: users.gender,
					theocraticStatus: users.theocraticStatus,
					fieldServiceGroupId: users.fieldServiceGroupId,
					systemRole: users.systemRole,
				})
				.from(users)
				.where(and(notHiddenAdmin, eq(users.active, true)))
				.orderBy(asc(users.fullName)),
			db
				.select({ userId: theocraticAppointments.userId, type: theocraticAppointments.appointmentType })
				.from(theocraticAppointments)
				.where(isNull(theocraticAppointments.endDate)),
			canPrivileges
				? db.select({ userId: userPrivileges.userId, privilegeId: userPrivileges.privilegeId }).from(userPrivileges).where(eq(userPrivileges.active, true))
				: Promise.resolve([]),
			db.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name }).from(fieldServiceGroups).where(eq(fieldServiceGroups.active, true)).orderBy(asc(fieldServiceGroups.name)),
		]);
		const apptBy = new Map<string, string[]>();
		for (const a of appointments) apptBy.set(a.userId, [...(apptBy.get(a.userId) ?? []), a.type]);
		const grantBy = new Map<string, string[]>();
		for (const g of grants) grantBy.set(g.userId, [...(grantBy.get(g.userId) ?? []), g.privilegeId]);

		return NextResponse.json({
			canPrivileges,
			canAppointments,
			groups,
			people: people.map((p) => ({
				...p,
				// Quien no es admin no puede tocar la cuenta de un administrador.
				locked: session.role !== "admin" && p.systemRole === "admin",
				appointments: apptBy.get(p.id) ?? [],
				privilegeIds: grantBy.get(p.id) ?? [],
			})),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const raw = await request.json().catch(() => null);
		const db = getDb();
		// Matriz (cambios por persona): cada mitad se valida según lo que traiga.
		if (raw && typeof raw === "object" && "changes" in raw) {
			const m = matrixSchema.safeParse(raw);
			if (!m.success) return NextResponse.json({ error: "invalid_body", details: m.error.flatten() }, { status: 400 });
			const doPriv = m.data.changes.some((c) => c.privileges);
			const doAppt = m.data.changes.some((c) => c.appointments);
			if (doPriv && !canAdministerAccounts(session)) throw new RbacError("Se requiere el privilegio de administración de cuentas.");
			if (doAppt && !(await canManageAppointments(db, session))) {
				throw new RbacError("Solo el comité de servicio o un administrador puede gestionar nombramientos.");
			}
			const result = await applyMatrix(db, m.data, { actorId: session.userId, skipAdmins: session.role !== "admin", doPrivileges: doPriv, doAppointments: doAppt });
			return NextResponse.json({ ok: true, ...result });
		}
		const parsed = bulkSchema.safeParse(raw);
		if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		const doPrivileges = !!parsed.data.privileges;
		const doAppointments = !!parsed.data.appointments;
		if (!doPrivileges && !doAppointments) return NextResponse.json({ error: "nothing_to_do" }, { status: 400 });
		if (doPrivileges && !canAdministerAccounts(session)) throw new RbacError("Se requiere el privilegio de administración de cuentas.");
		if (doAppointments && !(await canManageAppointments(db, session))) {
			throw new RbacError("Solo el comité de servicio o un administrador puede gestionar nombramientos.");
		}
		const result = await applyBulk(db, parsed.data, {
			actorId: session.userId,
			skipAdmins: session.role !== "admin",
			doPrivileges,
			doAppointments,
		});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		if (error instanceof BulkError) return NextResponse.json({ error: error.code }, { status: 400 });
		return errorResponse(error);
	}
}
