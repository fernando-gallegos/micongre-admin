import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { theocraticAppointments, users, welcomeAnimations } from "@/db/schema";
import { foldersFor } from "./folders";

/** Elige al azar una animación entre todas las carpetas que le tocan a la persona: «todos» y la de su sexo; y, si es precursor
 * regular, también las tres de Precursores (con el mismo criterio de sexo). Devuelve null si no hay ninguna. */
export async function pickAnimationFor(db: Database, userId: string): Promise<{ id: string; name: string } | null> {
	const [user] = await db.select({ gender: users.gender }).from(users).where(eq(users.id, userId)).limit(1);
	if (!user) return null;
	const [pioneer] = await db
		.select({ id: theocraticAppointments.id })
		.from(theocraticAppointments)
		.where(and(eq(theocraticAppointments.userId, userId), eq(theocraticAppointments.appointmentType, "regular_pioneer"), isNull(theocraticAppointments.endDate)))
		.limit(1);
	const folders = foldersFor(user.gender, !!pioneer);
	const pool = await db.select({ id: welcomeAnimations.id, name: welcomeAnimations.name }).from(welcomeAnimations).where(inArray(welcomeAnimations.folder, folders));
	return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
