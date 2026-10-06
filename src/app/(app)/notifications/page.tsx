import { redirect } from "next/navigation";
import { NotificationsModule } from "@/components/notifications/NotificationsModule";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

const SCOPE_PRIVILEGE = [
	{ scope: "publisher" as const, code: PRIVILEGE_CODES.NOTIFY_PUBLISHERS },
	{ scope: "group" as const, code: PRIVILEGE_CODES.NOTIFY_GROUP },
	{ scope: "congregation" as const, code: PRIVILEGE_CODES.NOTIFY_CONGREGATION },
];

// Avisos lo abre cualquier usuario autenticado (pestaña Recibidos). Quien además
// puede enviar (admin o algún privilegio notify_*) ve Enviados y «Nuevo aviso»;
// la API de envío sigue validándolo con assertCanAccessNotificationsModule.
export default async function NotificationsPage() {
	const session = await getSession();
	if (!session) redirect("/login");

	const isAdmin = session.role === "admin";
	const availableScopes = SCOPE_PRIVILEGE.filter(({ code }) => isAdmin || session.privilegeCodes.includes(code)).map(
		({ scope }) => scope,
	);

	return <NotificationsModule availableScopes={availableScopes} canSend={availableScopes.length > 0} />;
}
