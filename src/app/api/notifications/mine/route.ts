import { and, desc, eq, gte, inArray, notInArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { notificationDismissals, notificationRecipients, notifications, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

// Feed de Mi Panel: unión de lo enviado a toda la congregación, lo enviado
// al grupo de servicio propio, y lo enviado puntualmente a mí — cada fila ya
// resuelta con quién y cuándo la envió, para no pedir nada más al cliente.
// Excluye lo que yo mismo haya ocultado (ver notification_dismissals) — eso
// es un ocultamiento mío, no un "leído" global.
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		const [me] = await db
			.select({ fieldServiceGroupId: users.fieldServiceGroupId })
			.from(users)
			.where(eq(users.id, session.userId))
			.limit(1);

		const myRecipientRows = await db
			.select({ notificationId: notificationRecipients.notificationId })
			.from(notificationRecipients)
			.where(eq(notificationRecipients.userId, session.userId));
		const myNotificationIds = myRecipientRows.map((r) => r.notificationId);

		const myDismissalRows = await db
			.select({ notificationId: notificationDismissals.notificationId })
			.from(notificationDismissals)
			.where(eq(notificationDismissals.userId, session.userId));
		const dismissedIds = myDismissalRows.map((r) => r.notificationId);

		const scopeConditions = [
			eq(notifications.scope, "congregation"),
			...(me?.fieldServiceGroupId
				? [and(eq(notifications.scope, "group"), eq(notifications.groupId, me.fieldServiceGroupId))]
				: []),
			...(myNotificationIds.length
				? [and(eq(notifications.scope, "publisher"), inArray(notifications.id, myNotificationIds))]
				: []),
		];

		const today = new Date().toISOString().slice(0, 10);
		const rows = await db
			.select({
				id: notifications.id,
				scope: notifications.scope,
				message: notifications.message,
				createdAt: notifications.createdAt,
				senderName: users.fullName,
			})
			.from(notifications)
			.innerJoin(users, eq(users.id, notifications.senderUserId))
			.where(
				and(
					or(...scopeConditions),
					gte(notifications.expiresAt, today),
					...(dismissedIds.length ? [notInArray(notifications.id, dismissedIds)] : []),
				),
			)
			.orderBy(desc(notifications.createdAt))
			.limit(20);

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}
