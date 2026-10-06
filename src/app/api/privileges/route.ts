import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { PRIVILEGE_CATEGORIES, privileges } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessOperationalModule, canAdministerAccounts } from "@/lib/rbac/guards";

// Catálogo completo (o filtrado por categoría) — alimenta el selector de
// "otorgar privilegio" en la ficha de publicador (admin o "Administración de
// cuentas") y el de "agregar tarea" en la matriz operativa (admin o acceso al
// módulo operativo), así que el guard no puede ser admin-only a secas.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		if (session.role !== "admin" && !canAdministerAccounts(session)) assertCanAccessOperationalModule(session);

		const { searchParams } = new URL(request.url);
		const category = searchParams.get("category");
		const conditions = [eq(privileges.active, true)];
		if (category && (PRIVILEGE_CATEGORIES as readonly string[]).includes(category)) {
			conditions.push(eq(privileges.category, category as (typeof PRIVILEGE_CATEGORIES)[number]));
		}

		const db = getDb();
		const rows = await db
			.select()
			.from(privileges)
			.where(and(...conditions))
			.orderBy(asc(privileges.category), asc(privileges.name));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}
