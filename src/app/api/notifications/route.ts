import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fieldServiceGroups, notificationRecipients, notifications, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { notifyUsers } from "@/lib/push/dispatch";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAccessNotificationsModule } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { chunked } from "@/lib/cleaning/meetings";
import { createNotificationSchema } from "@/lib/validation/notifications";

// Historial de envío: un admin ve todo lo enviado por cualquiera (necesita
// supervisar el módulo completo); alguien con privilegio de notificar pero
// sin ser admin solo ve lo que él mismo envió — no es una bandeja global.
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessNotificationsModule(session);
		const isAdmin = session.role === "admin";

		const db = getDb();
		const rows = await db
			.select({
				id: notifications.id,
				scope: notifications.scope,
				groupId: notifications.groupId,
				groupName: fieldServiceGroups.name,
				groupColor: fieldServiceGroups.color,
				message: notifications.message,
				expiresAt: notifications.expiresAt,
				createdAt: notifications.createdAt,
				senderUserId: notifications.senderUserId,
				senderName: users.fullName,
			})
			.from(notifications)
			.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, notifications.groupId))
			.innerJoin(users, eq(users.id, notifications.senderUserId))
			.where(isAdmin ? undefined : eq(notifications.senderUserId, session.userId))
			.orderBy(desc(notifications.createdAt))
			.limit(50);

		const publisherScopedIds = rows.filter((r) => r.scope === "publisher").map((r) => r.id);
		const recipientRows = publisherScopedIds.length
			? await db
					.select({ notificationId: notificationRecipients.notificationId, fullName: users.fullName })
					.from(notificationRecipients)
					.innerJoin(users, eq(users.id, notificationRecipients.userId))
					.where(inArray(notificationRecipients.notificationId, publisherScopedIds))
			: [];
		const recipientsByNotification = new Map<string, string[]>();
		for (const r of recipientRows) {
			const list = recipientsByNotification.get(r.notificationId) ?? [];
			list.push(r.fullName);
			recipientsByNotification.set(r.notificationId, list);
		}

		return NextResponse.json({
			items: rows.map((r) => ({ ...r, recipientNames: recipientsByNotification.get(r.id) ?? [] })),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = createNotificationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const isAdmin = session.role === "admin";

		if (parsed.data.scope === "publisher") {
			if (!isAdmin && !session.privilegeCodes.includes(PRIVILEGE_CODES.NOTIFY_PUBLISHERS)) {
				throw new RbacError("No tienes permiso para enviar notificaciones a publicadores.");
			}
			// Solo destinatarios que existen (un id inexistente rompía la clave foránea con un 500 y dejaba el aviso huérfano).
			const wanted = [...new Set(parsed.data.recipientUserIds)];
			const existing = (
				await Promise.all(chunked(wanted).map((ids) => db.select({ id: users.id }).from(users).where(inArray(users.id, ids))))
			)
				.flat()
				.map((u) => u.id);
			if (existing.length === 0) return NextResponse.json({ error: "no_recipients" }, { status: 400 });
			const [notification] = await db
				.insert(notifications)
				.values({
					senderUserId: session.userId,
					scope: "publisher",
					message: parsed.data.message,
					expiresAt: parsed.data.expiresAt,
				})
				.returning({ id: notifications.id });
			await db
				.insert(notificationRecipients)
				.values(existing.map((userId) => ({ notificationId: notification.id, userId })));
			await notifyUsers(db, existing, {
				title: `${session.fullName} te envió una notificación`,
				body: parsed.data.message,
				url: "/panel",
			});
			return NextResponse.json({ id: notification.id }, { status: 201 });
		}

		if (parsed.data.scope === "group") {
			if (!isAdmin && !session.privilegeCodes.includes(PRIVILEGE_CODES.NOTIFY_GROUP)) {
				throw new RbacError("No tienes permiso para enviar notificaciones a tu grupo de servicio.");
			}
			const [me] = await db
				.select({ fieldServiceGroupId: users.fieldServiceGroupId })
				.from(users)
				.where(eq(users.id, session.userId))
				.limit(1);
			if (!me?.fieldServiceGroupId) {
				return NextResponse.json({ error: "no_group" }, { status: 400 });
			}
			const [notification] = await db
				.insert(notifications)
				.values({
					senderUserId: session.userId,
					scope: "group",
					groupId: me.fieldServiceGroupId,
					message: parsed.data.message,
					expiresAt: parsed.data.expiresAt,
				})
				.returning({ id: notifications.id });
			const groupMembers = await db
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.fieldServiceGroupId, me.fieldServiceGroupId), ne(users.id, session.userId), notHiddenAdmin));
			await notifyUsers(
				db,
				groupMembers.map((u) => u.id),
				{ title: `${session.fullName} envió una notificación a tu grupo`, body: parsed.data.message, url: "/panel" },
			);
			return NextResponse.json({ id: notification.id }, { status: 201 });
		}

		if (!isAdmin && !session.privilegeCodes.includes(PRIVILEGE_CODES.NOTIFY_CONGREGATION)) {
			throw new RbacError("No tienes permiso para enviar notificaciones a toda la congregación.");
		}
		const [notification] = await db
			.insert(notifications)
			.values({
				senderUserId: session.userId,
				scope: "congregation",
				message: parsed.data.message,
				expiresAt: parsed.data.expiresAt,
			})
			.returning({ id: notifications.id });
		const allActiveUsers = await db
			.select({ id: users.id })
			.from(users)
			.where(and(eq(users.accountStatus, "active"), ne(users.id, session.userId), notHiddenAdmin));
		await notifyUsers(
			db,
			allActiveUsers.map((u) => u.id),
			{ title: `${session.fullName} envió una notificación a la congregación`, body: parsed.data.message, url: "/panel" },
		);
		return NextResponse.json({ id: notification.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
