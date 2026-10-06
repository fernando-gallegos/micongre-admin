import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accountActivationTokens, deviceTokens, pushSubscriptions, refreshTokens, users } from "@/db/schema";

/** Un administrador con acceso que no sea esta persona: si no existe, cerrarle el acceso dejaría la app sin quién la administre. */
export async function hasOtherActiveAdmin(db: Database, userId: string): Promise<boolean> {
	const [other] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.systemRole, "admin"), eq(users.accountStatus, "active"), ne(users.id, userId)))
		.limit(1);
	return Boolean(other);
}

/**
 * Elimina la CUENTA de acceso de una persona (usuario, contraseña, sesiones, dispositivos con la app y avisos push),
 * pero NO a la persona: su ficha de publicador, nombramientos, asignaciones e informes siguen en la congregación y los
 * administra quien lleva el sitio. La persona queda como "Sin cuenta"; un administrador puede darle acceso de nuevo.
 */
export async function removeAccountAccess(db: Database, userId: string): Promise<void> {
	await db.batch([
		db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)),
		db.delete(deviceTokens).where(eq(deviceTokens.userId, userId)),
		db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
		db.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, userId)),
		db
			.update(users)
			.set({ username: null, passwordHash: null, accountStatus: "no_account", navShortcut: null, updatedAt: new Date() })
			.where(eq(users.id, userId)),
	]);
}
