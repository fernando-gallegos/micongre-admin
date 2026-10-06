import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { fieldServiceGroups } from "./fieldService";
import { users } from "./users";

export const NOTIFICATION_SCOPES = ["publisher", "group", "congregation"] as const;

// Un mensaje enviado por quien tiene el privilegio correspondiente al scope:
// "publisher" (a uno o más publicadores puntuales, ver notification_recipients),
// "group" (al grupo de servicio del remitente — groupId fija cuál, por si el
// remitente cambia de grupo después) o "congregation" (a todos). Se resuelve
// en Mi Panel filtrando por quién es el usuario logueado, no por un campo
// "leído" — es un feed, no una bandeja con estado. expiresAt acota solo esa
// vista de Mi Panel (feed "vigente"): el módulo de Notificaciones siempre
// muestra el historial completo del remitente, vencido o no.
export const notifications = sqliteTable("notifications", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	senderUserId: text("sender_user_id")
		.notNull()
		.references(() => users.id),
	scope: text("scope", { enum: NOTIFICATION_SCOPES }).notNull(),
	groupId: text("group_id").references(() => fieldServiceGroups.id),
	message: text("message").notNull(),
	expiresAt: text("expires_at").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// Solo se llena para scope="publisher" — quiénes son los destinatarios
// puntuales de ese envío.
export const notificationRecipients = sqliteTable(
	"notification_recipients",
	{
		notificationId: text("notification_id")
			.notNull()
			.references(() => notifications.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
	},
	(t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

// Un usuario oculta una notificación puntual desde Mi Panel — no es un
// "leído" (el feed sigue sin llevar ese estado para nadie más ni para el
// historial del remitente), es un ocultamiento permanente solo para quien lo
// pidió. Ver api/notifications/mine, que excluye estos ids.
export const notificationDismissals = sqliteTable(
	"notification_dismissals",
	{
		notificationId: text("notification_id")
			.notNull()
			.references(() => notifications.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		dismissedAt: integer("dismissed_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);
