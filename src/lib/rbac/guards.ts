import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { fieldServiceGroups, theocraticAppointments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { FIELD_SERVICE_GROUP_APPOINTMENTS, PRIVILEGE_CODES, SERVICE_COMMITTEE_APPOINTMENTS } from "./roles";
import { getEligiblePublishers } from "./eligibility";
import { RbacError } from "./errors";

export function requireAdmin(session: Session | null): asserts session is Session {
	if (!session || session.role !== "admin") {
		throw new RbacError("Se requiere rol de administrador.");
	}
}

export function requirePrivilege(
	session: Session | null,
	privilegeCode: string,
): asserts session is Session {
	if (!session || !session.privilegeCodes.includes(privilegeCode)) {
		throw new RbacError(`Se requiere el privilegio '${privilegeCode}'.`);
	}
}

/** Revalida en el servidor que `candidateUserId` sigue siendo elegible para
 * `privilegeId` justo antes de escribir la asignación — para que un request
 * manipulado no pueda forzar una asignación inválida aunque el cliente esté
 * desactualizado. */
export async function assertEligibleForAssignment(
	db: Database,
	privilegeId: string,
	candidateUserId: string,
): Promise<void> {
	const eligible = await getEligiblePublishers(db, privilegeId);
	if (!eligible.some((u) => u.id === candidateUserId)) {
		throw new RbacError("El publicador seleccionado no es elegible para este privilegio.");
	}
}

/** Autoría dual de informes S-4: el propio publicador, o el superintendente/
 * auxiliar del grupo de servicio al que pertenece el publicador objetivo. */
export async function assertCanManageReport(
	db: Database,
	session: Session,
	targetUserId: string,
	{ allowSelf = true }: { allowSelf?: boolean } = {},
): Promise<void> {
	if (
		session.role === "admin" ||
		(allowSelf && session.userId === targetUserId) ||
		session.privilegeCodes.includes(PRIVILEGE_CODES.REPORTS_ALL) ||
		// «Recolección de informes» (S-4/S-21, p. ej. el secretario) también los ve y corrige todos.
		session.privilegeCodes.includes(PRIVILEGE_CODES.FIELD_SERVICE_REPORTS)
	) {
		return;
	}

	const [target] = await db
		.select({ fieldServiceGroupId: users.fieldServiceGroupId })
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);

	if (!target?.fieldServiceGroupId) {
		throw new RbacError("No tienes permiso para gestionar el informe de este publicador.");
	}

	// Camino directo: el permiso "Informes del grupo" otorgado a mano, sin
	// requerir el nombramiento formal de superintendente/auxiliar — pensado
	// para capacitar o apoyar sin dar el nombramiento en sí.
	if (session.privilegeCodes.includes(PRIVILEGE_CODES.REPORTS_GROUP)) {
		const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
		if (ownGroupId && ownGroupId === target.fieldServiceGroupId) return;
	}

	const [group] = await db
		.select()
		.from(fieldServiceGroups)
		.where(eq(fieldServiceGroups.id, target.fieldServiceGroupId))
		.limit(1);

	const isOverseerOrAssistant =
		!!group && (group.overseerUserId === session.userId || group.assistantUserId === session.userId);
	if (!isOverseerOrAssistant) {
		throw new RbacError("No tienes permiso para gestionar el informe de este publicador.");
	}

	const [activeGroupAppointment] = await db
		.select()
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, session.userId),
				isNull(theocraticAppointments.endDate),
				inArray(theocraticAppointments.appointmentType, [...FIELD_SERVICE_GROUP_APPOINTMENTS]),
			),
		)
		.limit(1);

	if (!activeGroupAppointment) {
		throw new RbacError("No tienes permiso para gestionar el informe de este publicador.");
	}
}

export function assertCanRecordAttendance(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.MEETING_ATTENDANCE_RECORDER))) {
		throw new RbacError("Se requiere el privilegio de registro de asistencia (S-88).");
	}
}

/** Cuentas de mantenimiento del Salón del Reino (S-26/S-44): admin, o el
 * siervo de cuentas/coordinador de mantenimiento vía el privilegio que
 * califica automáticamente por nombramiento activo. */
/** Paquete S-61 y decisión propia en una recomendación S-62: admin, o el SC
 * de visita con el privilegio co_visit_access otorgado por enlace de
 * activación temporal (ver src/lib/auth/activation.ts). */
export function assertCanAccessCoVisitDossier(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CO_VISIT_ACCESS))) {
		throw new RbacError("Se requiere acceso de visita del superintendente de circuito.");
	}
}

/** Tablero de pastoreo: admin, o cualquier anciano activo vía el privilegio
 * que califica automáticamente por nombramiento (migrations/0021). */
export function assertCanAccessPastoralDashboard(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.PASTORAL_CARE_ACCESS))) {
		throw new RbacError("Se requiere acceso pastoral (ancianos).");
	}
}

/** Comité de servicio (cobe/secretario/superintendente de servicio) — puede
 * ver las notas confidenciales de cualquier visita de pastoreo y prender/
 * apagar su visibilidad general para todos los ancianos. */
export async function isServiceCommitteeMember(db: Database, userId: string): Promise<boolean> {
	const [activeAppointment] = await db
		.select()
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, userId),
				isNull(theocraticAppointments.endDate),
				inArray(theocraticAppointments.appointmentType, [...SERVICE_COMMITTEE_APPOINTMENTS]),
			),
		)
		.limit(1);
	return !!activeAppointment;
}

/** Superintendente de servicio (nombramiento activo, no todo el comité) —
 * quien ve la columna "Progreso" (horas del año de servicio) en Publicadores. */
export async function isServiceOverseer(db: Database, userId: string): Promise<boolean> {
	const [activeAppointment] = await db
		.select()
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, userId),
				isNull(theocraticAppointments.endDate),
				eq(theocraticAppointments.appointmentType, "service_overseer"),
			),
		)
		.limit(1);
	return !!activeAppointment;
}

/** Solicitudes de pastoreo (Mi Panel → comité): a diferencia del resto del
 * módulo pastoral, que es de "cualquier anciano activo", ver/asignar el
 * listado completo es solo del comité de servicio o un admin — coincide con
 * quién ve una solicitud sin asignar en getUserAssignments. */
export async function assertIsServiceCommittee(db: Database, session: Session | null): Promise<void> {
	if (!session) throw new RbacError("Se requiere iniciar sesión.");
	if (session.role === "admin") return;
	if (!(await isServiceCommitteeMember(db, session.userId))) {
		throw new RbacError("Solo el comité de servicio puede ver y asignar solicitudes de pastoreo.");
	}
}

/** Ficha del publicador → "Acceso a la app" y "Privilegios otorgados":
 * admin, o el privilegio "Administración de cuentas". */
export function canAdministerAccounts(session: Session | null): boolean {
	return !!session && (session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.ACCOUNTS_ADMIN));
}

/** Igual que canAdministerAccounts, pero además revalida contra el publicador
 * objetivo: quien no es admin no puede tocar la cuenta de un admin (con un
 * enlace de acceso o un privilegio se apoderaría de ella). */
export async function assertCanAdministerAccounts(
	db: Database,
	session: Session | null,
	targetUserId: string,
): Promise<Session> {
	if (!session || !canAdministerAccounts(session)) {
		throw new RbacError("Se requiere el privilegio de administración de cuentas.");
	}
	if (session.role === "admin") return session;
	const [target] = await db
		.select({ systemRole: users.systemRole })
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);
	if (target?.systemRole === "admin") {
		throw new RbacError("Solo un administrador puede gestionar la cuenta de otro administrador.");
	}
	return session;
}

/** Ficha del publicador → "Nombramientos": admin, o el comité de servicio
 * (coordinador del cuerpo de ancianos, secretario, superintendente de servicio). */
export async function canManageAppointments(db: Database, session: Session | null): Promise<boolean> {
	if (!session) return false;
	return session.role === "admin" || (await isServiceCommitteeMember(db, session.userId));
}

/** Tarjeta S-21 y recolección de informes: admin, o el privilegio
 * "Recolección de informes de servicio". */
export function canViewS21(session: Session | null): boolean {
	return (
		!!session &&
		(session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.FIELD_SERVICE_REPORTS))
	);
}

/** Grupos de servicio que este usuario supervisa (superintendente o auxiliar
 * con el nombramiento correspondiente activo) — usados para acotar la vista
 * de "informes de mi grupo" a quien no es admin. */
export async function getManagedGroupIds(db: Database, userId: string): Promise<string[]> {
	const [activeGroupAppointment] = await db
		.select()
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, userId),
				isNull(theocraticAppointments.endDate),
				inArray(theocraticAppointments.appointmentType, [...FIELD_SERVICE_GROUP_APPOINTMENTS]),
			),
		)
		.limit(1);
	if (!activeGroupAppointment) return [];

	const groups = await db
		.select({ id: fieldServiceGroups.id })
		.from(fieldServiceGroups)
		.where(or(eq(fieldServiceGroups.overseerUserId, userId), eq(fieldServiceGroups.assistantUserId, userId)));

	return groups.map((g) => g.id);
}

/** Grupo de servicio propio del usuario — base del alcance "del grupo" de
 * los permisos de acceso por módulo (households_group/reports_group/
 * publishers_group): ese grupo, no los que supervisa (ver getManagedGroupIds). */
export async function getOwnFieldServiceGroupId(db: Database, userId: string): Promise<string | null> {
	const [row] = await db
		.select({ fieldServiceGroupId: users.fieldServiceGroupId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.fieldServiceGroupId ?? null;
}

/** Módulo Hogares: admin, o el permiso otorgado "Hogares del grupo"/"Todos
 * los hogares" — gate de página/listado, el acotado por grupo se resuelve
 * aparte en cada endpoint. */
export function assertCanAccessHouseholdsModule(session: Session | null): asserts session is Session {
	if (
		!session ||
		(session.role !== "admin" &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_ALL) &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_GROUP))
	) {
		throw new RbacError("No tienes acceso al módulo de hogares.");
	}
}

/** Módulo Publicadores: admin, o el permiso otorgado "Publicadores del
 * grupo"/"Todos los publicadores". */
export function assertCanAccessPublishersModule(session: Session | null): asserts session is Session {
	if (
		!session ||
		(session.role !== "admin" &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL) &&
			!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_GROUP))
	) {
		throw new RbacError("No tienes acceso al módulo de publicadores.");
	}
}

/** Módulo Grupos de servicio: admin, o el privilegio otorgado (por
 * nombramiento de anciano o a mano). */
export function assertCanAccessServiceGroupsModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.SERVICE_GROUPS_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de grupos de servicio.");
	}
}

/** Módulo Entre semana (reunión Vida y Ministerio Cristianos): admin, o el
 * privilegio otorgado. */
export function assertCanAccessMidweekModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.MIDWEEK_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de reuniones de entre semana.");
	}
}

/** Módulo Fin de semana (reunión pública/Atalaya): admin, o el privilegio
 * otorgado. */
export function assertCanAccessWeekendModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.WEEKEND_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de reuniones de fin de semana.");
	}
}

/** Módulo Tareas operativas: admin, o el privilegio otorgado. */
export function assertCanAccessOperationalModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.OPERATIONAL_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de acomodadores.");
	}
}

/** Módulo Limpieza del salón: admin, o el privilegio "Administrar limpieza". */
export function assertCanAccessCleaningModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CLEANING_ADMIN))) {
		throw new RbacError("No tienes acceso al módulo de limpieza.");
	}
}

/** Módulo Congregación (datos/ajustes de la congregación): admin, o el
 * privilegio otorgado. */
export function assertCanAccessCongregationModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CONGREGATION_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de congregación.");
	}
}

/** Módulo Contingencia (preparación para desastres): admin, o el privilegio
 * otorgado. */
export function assertCanAccessDisasterModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.DISASTER_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de contingencia.");
	}
}

/** Módulo Notificaciones: admin, o cualquiera de los 3 privilegios de envío
 * (a publicadores, al grupo propio, o a toda la congregación) — cuál de los
 * 3 tiene decide qué puede enviar, no si entra al módulo. */
export function assertCanAccessNotificationsModule(session: Session | null): asserts session is Session {
	const hasAny =
		!!session &&
		(session.role === "admin" ||
			[PRIVILEGE_CODES.NOTIFY_PUBLISHERS, PRIVILEGE_CODES.NOTIFY_GROUP, PRIVILEGE_CODES.NOTIFY_CONGREGATION].some(
				(code) => session.privilegeCodes.includes(code),
			));
	if (!hasAny) {
		throw new RbacError("No tienes acceso al módulo de notificaciones.");
	}
}

/** Módulo Visita del SC (agenda de la visita, precursores auxiliares,
 * recomendaciones S-62) — distinto del Paquete S-61 (`CO_VISIT_ACCESS`), que
 * sigue siendo de otorgamiento manual únicamente. */
export function assertCanAccessCoVisitScheduleModule(session: Session | null): asserts session is Session {
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CO_VISIT_SCHEDULE_ACCESS))) {
		throw new RbacError("No tienes acceso al módulo de visita del superintendente de circuito.");
	}
}

/** Un hogar concreto: admin o "Todos los hogares" → libre; "Hogares del
 * grupo" → el hogar debe tener algún miembro del grupo de servicio propio. */
export async function assertCanManageHousehold(db: Database, session: Session, householdId: string): Promise<void> {
	if (session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_ALL)) return;
	if (!session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_GROUP)) {
		throw new RbacError("No tienes permiso para gestionar este hogar.");
	}

	const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
	if (!ownGroupId) {
		throw new RbacError("No tienes permiso para gestionar este hogar.");
	}

	const [member] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.householdId, householdId), eq(users.fieldServiceGroupId, ownGroupId)))
		.limit(1);

	if (!member) {
		throw new RbacError("No tienes permiso para gestionar este hogar.");
	}
}

/** Un publicador concreto: admin o "Todos los publicadores" → libre;
 * "Publicadores del grupo" → el publicador objetivo debe ser del mismo
 * grupo de servicio que el que gestiona. */
export async function assertCanManagePublisher(db: Database, session: Session, targetUserId: string): Promise<void> {
	if (session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)) return;
	if (!session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_GROUP)) {
		throw new RbacError("No tienes permiso para gestionar este publicador.");
	}

	const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
	const [target] = await db
		.select({ fieldServiceGroupId: users.fieldServiceGroupId })
		.from(users)
		.where(eq(users.id, targetUserId))
		.limit(1);

	if (!ownGroupId || !target?.fieldServiceGroupId || target.fieldServiceGroupId !== ownGroupId) {
		throw new RbacError("No tienes permiso para gestionar este publicador.");
	}
}

/** Grupos a los que se acota la tabla de informes (S-4) para quien no es
 * admin ni tiene "Todos los informes": unión de los grupos que supervisa
 * (nombramiento formal, getManagedGroupIds) y su propio grupo si tiene el
 * permiso "Informes del grupo" — null significa "sin acotar" (ver todos). */
export async function getReportsGroupIds(db: Database, session: Session): Promise<string[] | null> {
	if (
		session.role === "admin" ||
		session.privilegeCodes.includes(PRIVILEGE_CODES.REPORTS_ALL) ||
		session.privilegeCodes.includes(PRIVILEGE_CODES.FIELD_SERVICE_REPORTS)
	)
		return null;

	const managedGroupIds = await getManagedGroupIds(db, session.userId);
	const groupIds = new Set(managedGroupIds);

	if (session.privilegeCodes.includes(PRIVILEGE_CODES.REPORTS_GROUP)) {
		const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
		if (ownGroupId) groupIds.add(ownGroupId);
	}

	return [...groupIds];
}

/** Nombramiento de anciano vigente. */
export async function isActiveElder(db: Database, userId: string): Promise<boolean> {
	const [elder] = await db
		.select({ id: theocraticAppointments.id })
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, userId),
				eq(theocraticAppointments.appointmentType, "elder"),
				isNull(theocraticAppointments.endDate),
			),
		)
		.limit(1);
	return !!elder;
}

/** Eliminar un publicador: admin, o un anciano (nombramiento de anciano
 * vigente) — además del alcance normal de la ficha (ver assertCanManagePublisher). */
export async function canDeletePublishers(db: Database, session: Session | null): Promise<boolean> {
	if (!session) return false;
	if (session.role === "admin") return true;
	return isActiveElder(db, session.userId);
}

/** Ver los privilegios otorgados a un publicador (ficha y tabla): los ancianos
 * y quien administra cuentas. Editarlos sigue siendo solo de
 * canAdministerAccounts. */
export async function canViewPrivileges(db: Database, session: Session | null): Promise<boolean> {
	if (!session) return false;
	if (canAdministerAccounts(session)) return true;
	return isActiveElder(db, session.userId);
}

/** Editar los informes de servicio de otro publicador (modo edición de la
 * S-21): mismo alcance que gestionar su informe S-4 — admin, "Todos los
 * informes", o el grupo propio/supervisado — pero sin contar el caso de "es
 * mi propio informe". */
export async function canEditReportsOf(db: Database, session: Session | null, targetUserId: string): Promise<boolean> {
	if (!session) return false;
	try {
		await assertCanManageReport(db, session, targetUserId, { allowSelf: false });
		return true;
	} catch (error) {
		if (error instanceof RbacError) return false;
		throw error;
	}
}

/** Publicadores cuya S-21 puede abrir quien mira: `null` = todos (admin, o el
 * privilegio de recolección de informes / "Todos los informes"); si no, los
 * grupos de servicio a los que se acota (puede ser una lista vacía). */
export async function getS21GroupScope(db: Database, session: Session | null): Promise<string[] | null> {
	if (!session) return [];
	if (canViewS21(session)) return null;
	return getReportsGroupIds(db, session);
}

/** Módulo Predicación: admin, «Administrar Predicación» (superintendente de servicio) o «Siervo de territorios» (las salidas usan sus territorios). El menú (navItems PREACHING_ITEM) usa la misma lista. */
export function canAccessPreachingModule(session: Session | null): boolean {
	return !!session && (session.role === "admin" || (session.privilegeCodes.includes(PRIVILEGE_CODES.PREACHING_ADMIN) || session.privilegeCodes.includes(PRIVILEGE_CODES.TERRITORY_MANAGEMENT)));
}

export function assertCanAccessPreachingModule(session: Session | null): asserts session is Session {
	if (!canAccessPreachingModule(session)) {
		throw new RbacError("No tienes acceso al módulo de predicación.");
	}
}

/** Módulo Territorios: admin, o el privilegio "Siervo de territorios" (que
 * reciben solos el superintendente de servicio y el siervo de territorios). */
export function canAccessTerritoriesModule(session: Session | null): boolean {
	return !!session && (session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.TERRITORY_MANAGEMENT));
}

export function assertCanAccessTerritoriesModule(session: Session | null): asserts session is Session {
	if (!canAccessTerritoriesModule(session)) {
		throw new RbacError("No tienes acceso al módulo de territorios.");
	}
}
