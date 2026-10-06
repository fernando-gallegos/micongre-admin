import { count, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";

export interface SetupStatus {
	/** true mientras no exista ningún administrador: la app es nueva. */
	needsSetup: boolean;
	/** Usuarios ya cargados (p. ej. con scripts/import-hourglass.mjs) — el
	 * asistente no migra encima de datos existentes. */
	userCount: number;
}

export async function getSetupStatus(db: Database): Promise<SetupStatus> {
	const [admins] = await db.select({ n: count() }).from(users).where(eq(users.systemRole, "admin"));
	const [all] = await db.select({ n: count() }).from(users);
	return { needsSetup: (admins?.n ?? 0) === 0, userCount: all?.n ?? 0 };
}
