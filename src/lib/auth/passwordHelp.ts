// «¿Olvidaste tu contraseña?» del login. No hay correo: la persona escribe su usuario o su nombre y avisamos (notificación en Mi Panel +
// push) a quien puede ayudarla — los administradores, quienes tienen el privilegio de administrar cuentas y el superintendente y el
// auxiliar de su grupo —, que le generan un enlace nuevo desde su ficha (Acceso → «Nuevo enlace») y se lo mandan por WhatsApp.
// La respuesta al navegador es SIEMPRE la misma (exista o no la cuenta) para no revelar quién usa la app.
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { fieldServiceGroups, notificationRecipients, notifications, passwordHelpRequests, users } from "@/db/schema";
import { notifyUsers } from "@/lib/push/dispatch";
import { getEligiblePublishers } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { hashOpaqueToken } from "./tokens";

/** Una solicitud por persona cada 6 horas (las repetidas no vuelven a avisar) y como mucho 5 por dirección IP cada hora. */
const PER_USER_WINDOW_MS = 6 * 3600 * 1000;
const PER_IP_WINDOW_MS = 3600 * 1000;
const PER_IP_MAX = 5;
const KEEP_DAYS = 30;

/** Para comparar nombres: sin tildes, sin mayúsculas y con un solo espacio. */
export function normalizeName(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/** La persona que corresponde a lo escrito: el usuario exacto (sin importar mayúsculas) o, si no, un nombre completo que coincida con
 * UNA sola persona (con nombres repetidos no se adivina). */
export function findPersonByIdentifier<T extends { id: string; fullName: string; username: string | null }>(people: T[], identifier: string): T | null {
	const typed = identifier.trim();
	if (!typed) return null;
	const byUsername = people.find((p) => p.username && p.username.toLowerCase() === typed.toLowerCase());
	if (byUsername) return byUsername;
	const name = normalizeName(typed);
	const byName = people.filter((p) => normalizeName(p.fullName) === name);
	return byName.length === 1 ? byName[0] : null;
}

function inDays(days: number): string {
	return new Date(Date.now() + days * 86400 * 1000).toISOString().slice(0, 10);
}

/** Registra la solicitud y avisa a quien puede ayudar. Nunca lanza por «no existe»: el llamador responde lo mismo siempre. */
export async function requestPasswordHelp(db: Database, identifier: string, ip: string): Promise<void> {
	const now = Date.now();
	await db.delete(passwordHelpRequests).where(lt(passwordHelpRequests.createdAt, new Date(now - KEEP_DAYS * 86400 * 1000)));

	const ipHash = await hashOpaqueToken(`password-help:${ip}`);
	const recentFromIp = await db
		.select({ id: passwordHelpRequests.id })
		.from(passwordHelpRequests)
		.where(and(eq(passwordHelpRequests.ipHash, ipHash), gt(passwordHelpRequests.createdAt, new Date(now - PER_IP_WINDOW_MS))));
	if (recentFromIp.length >= PER_IP_MAX) return;

	const people = await db
		.select({
			id: users.id,
			fullName: users.fullName,
			username: users.username,
			groupId: users.fieldServiceGroupId,
			isHiddenAdmin: users.isHiddenAdmin,
			disfellowshipped: users.disfellowshipped,
		})
		.from(users);
	const person = findPersonByIdentifier(
		people.filter((p) => !p.disfellowshipped),
		identifier,
	);

	await db.insert(passwordHelpRequests).values({ userId: person?.id ?? null, ipHash });
	if (!person) return;

	// Ya pidió ayuda hace poco: no se vuelve a avisar (la primera solicitud sigue en Mi Panel de quien ayuda).
	const recentForUser = await db
		.select({ id: passwordHelpRequests.id })
		.from(passwordHelpRequests)
		.where(and(eq(passwordHelpRequests.userId, person.id), gt(passwordHelpRequests.createdAt, new Date(now - PER_USER_WINDOW_MS))));
	if (recentForUser.length > 1) return;

	// Quién puede ayudar. Un administrador oculto (la cuenta de configuración) solo lo pueden atender otros administradores.
	const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.systemRole, "admin"), eq(users.accountStatus, "active")));
	const accountAdmins = person.isHiddenAdmin ? [] : await getEligiblePublishers(db, PRIVILEGE_IDS.ACCOUNTS_ADMIN);
	let groupLeads: string[] = [];
	if (person.groupId && !person.isHiddenAdmin) {
		const [group] = await db
			.select({ overseer: fieldServiceGroups.overseerUserId, assistant: fieldServiceGroups.assistantUserId })
			.from(fieldServiceGroups)
			.where(eq(fieldServiceGroups.id, person.groupId))
			.limit(1);
		groupLeads = [group?.overseer, group?.assistant].filter((id): id is string => !!id);
	}
	const candidates = [...new Set([...admins.map((a) => a.id), ...accountAdmins.map((a) => a.id), ...groupLeads])].filter((id) => id !== person.id);
	if (candidates.length === 0) return;
	// Solo quienes pueden entrar a la app (si no, el aviso no lo vería nadie).
	const recipients = (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, candidates), eq(users.accountStatus, "active")))).map(
		(r) => r.id,
	);
	if (recipients.length === 0) return;

	const message = `${person.fullName} pidió ayuda para entrar a Mi Congre: olvidó su contraseña. Quien administra cuentas puede generarle un enlace nuevo en Publicadores → ${person.fullName} → Acceso → «Nuevo enlace» y enviárselo por WhatsApp; al abrirlo verá su usuario y una contraseña nueva.`;
	const [notification] = await db
		.insert(notifications)
		.values({ senderUserId: person.id, scope: "publisher", message, expiresAt: inDays(7) })
		.returning({ id: notifications.id });
	if (!notification) return;
	await db.insert(notificationRecipients).values(recipients.map((userId) => ({ notificationId: notification.id, userId })));
	await notifyUsers(db, recipients, { title: "Olvidó su contraseña", body: `${person.fullName} pidió ayuda para entrar a Mi Congre.`, url: `/publishers/${person.id}` });
}
