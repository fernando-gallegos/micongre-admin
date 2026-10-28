import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publicCongregationStatus, splitCongregationStatus, theocraticAppointments, userPrivileges, privileges, refreshTokens, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanManagePublisher, canDeletePublishers } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { updatePublisherSchema } from "@/lib/validation/publishers";
import { getEnv } from "@/lib/env";
import { deleteUserClearingReferences, UserHasRecordsError } from "@/lib/publishers/deleteUser";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		const { id } = await params;
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		await assertCanManagePublisher(db, session, id);

		const [publisher] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!publisher) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const [appointments, grantedPrivileges] = await Promise.all([
			db.select().from(theocraticAppointments).where(eq(theocraticAppointments.userId, id)),
			db
				.select({
					id: userPrivileges.id,
					privilegeId: userPrivileges.privilegeId,
					code: privileges.code,
					name: privileges.name,
					active: userPrivileges.active,
					approvedAt: userPrivileges.approvedAt,
				})
				.from(userPrivileges)
				.innerJoin(privileges, eq(privileges.id, userPrivileges.privilegeId))
				.where(eq(userPrivileges.userId, id)),
		]);

		const { passwordHash, passwordAlgo, ...safePublisher } = publisher;
		return NextResponse.json({
			...safePublisher,
			congregationStatus: publicCongregationStatus(safePublisher),
			appointments,
			privileges: grantedPrivileges,
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		const { id } = await params;
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		await assertCanManagePublisher(db, session, id);

		const parsed = updatePublisherSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { congregationStatus: statusInput, ...restData } = parsed.data;
		const data = { ...restData, ...(statusInput ? splitCongregationStatus(statusInput) : {}) };
		if (data.systemRole && data.systemRole !== "admin") data.isHiddenAdmin = false;

		// Fuera del alcance de "Publicadores del grupo/Todos los publicadores":
		// solo un admin puede cambiar el rol de sistema, habilitar/deshabilitar
		// la cuenta, o reasignar el grupo de servicio (evita auto-escalación y
		// evita mover gente fuera del propio grupo con un permiso pensado solo
		// para editar datos básicos).
		if (session.role !== "admin") {
			delete data.systemRole;
			delete data.isHiddenAdmin;
			if (!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)) delete data.fieldServiceGroupId;
			delete data.active;
		}

		const updated = await db
			.update(users)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(users.id, id))
			.returning({ id: users.id });
		if (updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

		// 14: al marcarlo como sacado se cierran sus sesiones (el login ya lo rechaza; el refresh también, pero así sale de inmediato).
		if (data.disfellowshipped) await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

// Un administrador nunca puede eliminarse (ni eliminar a otro admin) desde
// aquí — hay que quitarle el rol primero, así nunca se pierde el último
// acceso administrativo por accidente.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const db = getDb();
		if (!(await canDeletePublishers(db, session))) {
			throw new RbacError("Eliminar un publicador requiere un nombramiento de anciano.");
		}
		await assertCanManagePublisher(db, session, id);
		const [target] = await db.select({ systemRole: users.systemRole }).from(users).where(eq(users.id, id)).limit(1);
		if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
		if (target.systemRole === "admin") {
			throw new RbacError("No se puede eliminar a un administrador — quítale el rol primero.");
		}

		try {
			await deleteUserClearingReferences(getEnv().DB, id);
		} catch (error) {
			if (error instanceof UserHasRecordsError) {
				return NextResponse.json(
					{ error: "has_records", message: "Tiene registros a su nombre (informes que capturó, avisos que envió, es orador local, cuentas del salón…). Márcalo como inactivo en vez de eliminarlo." },
					{ status: 409 },
				);
			}
			throw error;
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
