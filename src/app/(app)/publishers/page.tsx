import { redirect } from "next/navigation";
import { PublisherTable } from "@/components/publishers/PublisherTable";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import {
	canAdministerAccounts,
	canDeletePublishers,
	canManageAppointments,
	canViewPrivileges,
	getS21GroupScope,
} from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function PublishersPage() {
	const session = await getSession();
	if (
		!session ||
		(session.role !== "admin" &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL) &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_GROUP))
	) {
		redirect("/panel");
	}

	// Las acciones de cada fila dependen del nombramiento o privilegio de quien
	// mira: nombramientos (comité de servicio), privilegios (administración de
	// cuentas; los ancianos solo los ven), tarjeta S-21 (recolección de informes o
	// permisos de informes) y eliminar (anciano).
	const db = getDb();
	const [appointments, remove, seePrivileges, s21Groups] = await Promise.all([
		canManageAppointments(db, session),
		canDeletePublishers(db, session),
		canViewPrivileges(db, session),
		getS21GroupScope(db, session),
	]);

	return (
		<PublisherTable
			isAdmin={session.role === "admin"}
			canEditGroup={session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)}
			canManageAppointments={appointments}
			canAdministerAccounts={canAdministerAccounts(session)}
			canViewPrivileges={seePrivileges}
			s21Scope={{ all: s21Groups === null, groupIds: s21Groups ?? [] }}
			canDelete={remove}
		/>
	);
}
