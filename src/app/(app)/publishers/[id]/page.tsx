import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
	fieldServiceGroups,
	households,
	privileges,
	theocraticAppointments,
	userPrivileges,
	users,
} from "@/db/schema";
import { AccessPanel } from "@/components/publishers/AccessPanel";
import { AppointmentsCard } from "@/components/publishers/AppointmentsCard";
import { CoVisitAccessPanel } from "@/components/coVisit/CoVisitAccessPanel";
import { BackIconButton, CallIconButton } from "@/components/publishers/HeaderIcons";
import { DeletePublisherButton } from "@/components/publishers/DeletePublisherButton";
import { EditPublisherForm } from "@/components/publishers/EditPublisherForm";
import { PrivilegesCard } from "@/components/publishers/PrivilegesCard";
import { PublisherTabs, type PublisherTab } from "@/components/publishers/PublisherTabs";
import { S21Button } from "@/components/publishers/S21Button";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";
import { Badge } from "@/components/ui/Card";
import { Avatar, List } from "@/components/ui/Layout";
import { getSession } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/dateFormat";
import { CONGREGATION_STATUS_LABELS, THEOCRATIC_STATUS_LABELS } from "@/lib/publisherLabels";
import {
	canAdministerAccounts,
	canDeletePublishers,
	canEditReportsOf,
	canManageAppointments,
	canViewPrivileges,
	canViewS21,
	getOwnFieldServiceGroupId,
} from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
	no_account: "Sin cuenta",
	invited: "Invitado",
	active: "Con acceso",
	disabled: "Deshabilitado",
};

export default async function PublisherDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await getSession();
	const hasPublishersAll = session?.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL) ?? false;
	const hasPublishersGroup = session?.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_GROUP) ?? false;
	if (!session || (session.role !== "admin" && !hasPublishersAll && !hasPublishersGroup)) redirect("/panel");

	const { id } = await params;
	const db = getDb();

	const [publisher] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!publisher) notFound();

	// "Publicadores del grupo" (sin admin ni "Todos los publicadores"): solo
	// puede ver la ficha de alguien de su propio grupo de servicio.
	if (session.role !== "admin" && !hasPublishersAll) {
		const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
		if (!ownGroupId || publisher.fieldServiceGroupId !== ownGroupId) redirect("/panel");
	}

	const isAdmin = session.role === "admin";
	// Cada sección se ve según el nombramiento o privilegio de quien mira:
	// - Datos y Grupo de servicio: "Publicadores del grupo" (lo que da acceso a esta ficha).
	// - Nombramientos: comité de servicio (COBE, secretario, superintendente de servicio).
	// - Acceso a la app y editar Privilegios: "Administración de cuentas"; verlos
	//   (solo lectura): también los ancianos.
	// - Tarjeta S-21: "Recolección de informes de servicio" o los permisos de
	//   informes del grupo/todos (ver canEditReportsOf).
	const canEditGroup = isAdmin || hasPublishersAll;
	const showAppointments = await canManageAppointments(db, session);
	const showAccounts = canAdministerAccounts(session);
	const showPrivileges = await canViewPrivileges(db, session);
	const showS21 = canViewS21(session) || (await canEditReportsOf(db, session, id));
	const showDelete = await canDeletePublishers(db, session);
	const [allGroups, ownGroup, household] = await Promise.all([
		db.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name }).from(fieldServiceGroups),
		publisher.fieldServiceGroupId
			? db
					.select({ name: fieldServiceGroups.name, color: fieldServiceGroups.color })
					.from(fieldServiceGroups)
					.where(eq(fieldServiceGroups.id, publisher.fieldServiceGroupId))
					.limit(1)
					.then((rows) => rows[0] ?? null)
			: Promise.resolve(null),
		publisher.householdId
			? db
					.select({ label: households.label })
					.from(households)
					.where(eq(households.id, publisher.householdId))
					.limit(1)
					.then((rows) => rows[0] ?? null)
			: Promise.resolve(null),
	]);

	const [appointments, grantedPrivileges] = await Promise.all([
		db.select().from(theocraticAppointments).where(eq(theocraticAppointments.userId, id)),
		showPrivileges
			? db
					.select({
						id: userPrivileges.id,
						privilegeId: userPrivileges.privilegeId,
						code: privileges.code,
						name: privileges.name,
						active: userPrivileges.active,
					})
					.from(userPrivileges)
					.innerJoin(privileges, eq(privileges.id, userPrivileges.privilegeId))
					.where(eq(userPrivileges.userId, id))
			: Promise.resolve([]),
	]);

	const hasCoVisitAccess = grantedPrivileges.some((p) => p.code === PRIVILEGE_CODES.CO_VISIT_ACCESS && p.active);
	const showCoVisit = isAdmin && hasCoVisitAccess;

	const statusLine = [
		CONGREGATION_STATUS_LABELS[publisher.disfellowshipped ? "disfellowshipped" : publisher.congregationStatus] ??
			publisher.congregationStatus,
		ownGroup?.name,
		ACCOUNT_STATUS_LABEL[publisher.accountStatus],
	]
		.filter(Boolean)
		.join(" · ");

	const tabs: PublisherTab[] = [
		{
			value: "data",
			label: "Datos",
			content: (
				<List>
					<DataRow label="Condición" value={THEOCRATIC_STATUS_LABELS[publisher.theocraticStatus] ?? publisher.theocraticStatus} />
					<DataRow label="Sexo" value={publisher.gender === "male" ? "Varón" : "Mujer"} />
					<DataRow label="Nacimiento" value={publisher.birthDate ? formatShortDate(publisher.birthDate) : "—"} />
					<DataRow label="Bautismo" value={publisher.baptismDate ? formatShortDate(publisher.baptismDate) : "—"} />
					<DataRow
						label="Teléfono"
						value={publisher.phone ?? "—"}
						trailing={publisher.phone ? <CallIconButton phone={publisher.phone} /> : undefined}
					/>
					<DataRow label="Correo" value={publisher.email ?? "—"} />
					<DataRow label="Contacto de emergencia" value={publisher.emergencyContactName ?? "—"} />
					<DataRow label="Hogar" value={household?.label ?? "—"} />
					<DataRow
						label="Grupo de servicio"
						value={ownGroup ? <GroupBadge name={ownGroup.name} color={ownGroup.color} /> : "Sin grupo asignado"}
					/>
					<DataRow
						label="Tarjeta DPA"
						value={<Badge tone={publisher.hasDpaCard ? "success" : "neutral"}>{publisher.hasDpaCard ? "Sí" : "No"}</Badge>}
					/>
					<DataRow
						label="Informe de 15 min"
						value={
							<Badge tone={publisher.isEligibleForReducedReport ? "success" : "neutral"}>
								{publisher.isEligibleForReducedReport ? "Sí" : "No"}
							</Badge>
						}
					/>
					<DataRow label="Rol del sistema" value={publisher.systemRole === "admin" ? "Administrador" : "Regular"} />
					<DataRow
						label="Cuenta habilitada"
						value={<Badge tone={publisher.active ? "success" : "danger"}>{publisher.active ? "Sí" : "No"}</Badge>}
					/>
					<DataRow
						label="Estado de cuenta"
						value={
							<Badge tone={publisher.accountStatus === "active" ? "success" : "neutral"}>
								{ACCOUNT_STATUS_LABEL[publisher.accountStatus]}
							</Badge>
						}
					/>
				</List>
			),
		},
	];
	if (showAppointments) {
		tabs.push({
			value: "appointments",
			label: "Nomb.",
			content: <AppointmentsCard publisherId={publisher.id} appointments={appointments} />,
		});
	}
	if (showPrivileges) {
		tabs.push({
			value: "privileges",
			label: "Priv.",
			content: <PrivilegesCard publisherId={publisher.id} grantedPrivileges={grantedPrivileges} readOnly={!showAccounts} />,
		});
	}
	if (showAccounts || showCoVisit) {
		tabs.push({
			value: "access",
			label: "Acceso",
			content: (
				<div className="flex flex-col gap-5">
					{showAccounts && <AccessPanel publisherId={publisher.id} username={publisher.username} />}
					{showCoVisit && <CoVisitAccessPanel publisherId={publisher.id} />}
				</div>
			),
		});
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="-mx-2 flex items-center justify-between">
				<BackIconButton label="Volver a Personas" href="/publishers" />
				<div className="flex items-center">
					{showS21 && <S21Button userId={publisher.id} variant="row" />}
					<EditPublisherForm
						publisher={{
							id: publisher.id,
							fullName: publisher.fullName,
							gender: publisher.gender,
							congregationStatus: publisher.disfellowshipped ? "disfellowshipped" : publisher.congregationStatus,
							theocraticStatus: publisher.theocraticStatus,
							birthDate: publisher.birthDate,
							baptismDate: publisher.baptismDate,
							phone: publisher.phone,
							email: publisher.email,
							emergencyContactName: publisher.emergencyContactName,
							emergencyContactPhone: publisher.emergencyContactPhone,
							emergencyContactRelation: publisher.emergencyContactRelation,
							isMinor: publisher.isMinor,
							guardianUserId: publisher.guardianUserId,
							householdId: publisher.householdId,
							fieldServiceGroupId: publisher.fieldServiceGroupId,
							hasDpaCard: publisher.hasDpaCard,
							isEligibleForReducedReport: publisher.isEligibleForReducedReport,
							systemRole: publisher.systemRole,
							isHiddenAdmin: publisher.isHiddenAdmin,
							active: publisher.active,
						}}
						groups={allGroups}
						canEditGroup={canEditGroup}
					/>
					{showDelete && (
						<DeletePublisherButton
							publisherId={publisher.id}
							fullName={publisher.fullName}
							isAdmin={publisher.systemRole === "admin"}
							redirectTo="/publishers"
						/>
					)}
				</div>
			</div>

			<div className="flex items-center gap-4">
				<Avatar name={publisher.fullName} size={64} />
				<div className="min-w-0">
					<h1 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">{publisher.fullName}</h1>
					<p className="mt-1 text-sm text-ink-soft">{statusLine}</p>
				</div>
			</div>

			<PublisherTabs tabs={tabs} />
		</div>
	);
}

function DataRow({ label, value, trailing }: { label: string; value: React.ReactNode; trailing?: React.ReactNode }) {
	return (
		<div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-[13px] text-ink-soft">{label}</div>
				<div className="text-base font-medium text-ink">{value}</div>
			</div>
			{trailing}
		</div>
	);
}
