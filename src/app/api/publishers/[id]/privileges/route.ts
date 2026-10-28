import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { userPrivileges } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAdministerAccounts } from "@/lib/rbac/guards";
import { setPrivilegesSchema } from "@/lib/validation/appointments";

// Reemplaza el conjunto completo de privilegios activos del publicador de una
// sola vez: el cliente manda la lista final marcada en la UI (checkboxes) y
// el servidor calcula el diff — otorga lo nuevo, revoca lo que se destildó,
// y deja intacto lo que ya estaba y sigue marcado. Todo con la fecha de hoy,
// aprobado por quien hace la petición.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const sessionOrNull = await getSession();
		const { id: userId } = await params;
		const db = getDb();
		const session = await assertCanAdministerAccounts(db, sessionOrNull, userId);
		// Con «Administrar cuentas» se le dan privilegios a otros, nunca a uno mismo (si no, podría darse cualquiera). Un admin sí puede.
		if (session.role !== "admin" && userId === session.userId) throw new RbacError("No puedes cambiar tus propios privilegios; pídeselo a otro administrador.");

		const parsed = setPrivilegesSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const desiredIds = new Set(parsed.data.privilegeIds);

		const currentlyActive = await db
			.select({ privilegeId: userPrivileges.privilegeId })
			.from(userPrivileges)
			.where(and(eq(userPrivileges.userId, userId), eq(userPrivileges.active, true)));
		const currentIds = new Set(currentlyActive.map((r) => r.privilegeId));

		const toRevoke = [...currentIds].filter((id) => !desiredIds.has(id));
		const toGrant = [...desiredIds].filter((id) => !currentIds.has(id));
		const today = new Date().toISOString().slice(0, 10);

		if (toRevoke.length > 0) {
			await db
				.update(userPrivileges)
				.set({ active: false, revokedAt: today })
				.where(and(eq(userPrivileges.userId, userId), inArray(userPrivileges.privilegeId, toRevoke)));
		}

		// Fila por fila, no en un solo INSERT multi-fila: D1 tiene un límite de
		// variables ligadas por sentencia más bajo de lo documentado — un lote
		// grande (p. ej. "Seleccionar todo" sobre el catálogo) lo excedía incluso
		// troceado. Cada fila aquí es una sentencia aparte, así que no hay techo
		// práctico en cuántos privilegios se pueden otorgar de una vez.
		for (const privilegeId of toGrant) {
			await db
				.insert(userPrivileges)
				.values({ userId, privilegeId, approvedAt: today, approvedByUserId: session.userId, active: true })
				.onConflictDoUpdate({
					target: [userPrivileges.userId, userPrivileges.privilegeId],
					set: { active: true, approvedAt: today, approvedByUserId: session.userId, revokedAt: null },
				});
		}

		return NextResponse.json({ ok: true, granted: toGrant.length, revoked: toRevoke.length });
	} catch (error) {
		return errorResponse(error);
	}
}
