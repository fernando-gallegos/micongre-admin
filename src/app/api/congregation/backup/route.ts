import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { createBackup } from "@/lib/backup/backup";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/rbac/guards";

// Respaldo completo de los datos de la congregación (solo administradores).
// Todas las tablas de la base (territorios y sus mapas incluidos) menos las
// sesiones. Incluye datos personales y contraseñas cifradas: es un archivo sensible.
export async function GET() {
	try {
		const session = await getSession();
		requireAdmin(session);

		const backup = await createBackup(getEnv().DB);
		const tables = Object.values(backup.tables);
		return new NextResponse(JSON.stringify(backup), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				// Resumen para que quien descarga confirme qué incluye.
				"X-Backup-Tables": String(tables.length),
				"X-Backup-Rows": String(tables.reduce((n, t) => n + t.rows.length, 0)),
			},
		});
	} catch (error) {
		return errorResponse(error);
	}
}
