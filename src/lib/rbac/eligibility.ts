import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	appointmentPrivilegeRules,
	privileges,
	theocraticAppointments,
	userPrivileges,
	users,
} from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

export interface EligibleUser {
	id: string;
	fullName: string;
	gender: "male" | "female";
	householdId: string | null;
}

function isAdult(birthDate: string | null, asOfDate: string): boolean {
	if (!birthDate) return false;
	const birth = new Date(birthDate);
	const asOf = new Date(asOfDate);
	let age = asOf.getFullYear() - birth.getFullYear();
	const monthDiff = asOf.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birth.getDate())) age--;
	return age >= 18;
}

/** Datos de un publicador que hacen falta para decidir si cumple las restricciones duras de un privilegio. */
export interface EligibilityUserRow {
	id: string;
	fullName: string;
	gender: "male" | "female";
	householdId: string | null;
	birthDate: string | null;
	guardianUserId: string | null;
	theocraticStatus: string;
}

export interface PrivilegeConstraints {
	requiresMale: boolean;
	requiresBaptized: boolean;
	requiresAdult: boolean;
	allowsMinorWithParentalConsent: boolean;
}

/**
 * Núcleo PURO de la elegibilidad: de las personas que ya califican por nombramiento o concesión directa (y que son activas y no
 * ocultas), deja las que cumplen las restricciones duras del privilegio (sexo, bautizado, adulto o menor con consentimiento).
 * Lo comparten `getEligiblePublishers` (una consulta por privilegio) y la carga en bloque (`eligibleFromContext`), para que
 * nunca puedan discrepar.
 */
export function applyPrivilegeConstraints(
	privilege: PrivilegeConstraints,
	rows: EligibilityUserRow[],
	asOfDate: string,
): EligibleUser[] {
	return rows
		.filter((r) => !privilege.requiresMale || r.gender === "male")
		.filter((r) => !privilege.requiresBaptized || r.theocraticStatus === "baptized_publisher")
		.filter(
			(r) =>
				!privilege.requiresAdult ||
				isAdult(r.birthDate, asOfDate) ||
				(privilege.allowsMinorWithParentalConsent && r.guardianUserId !== null),
		)
		.map(({ id, fullName, gender, householdId }) => ({ id, fullName, gender, householdId }));
}

/**
 * Único punto que decide "quién puede hacer esto": combina elegibilidad por
 * nombramiento activo (appointment_privilege_rules) con concesión directa
 * aprobada (user_privileges), filtra por las restricciones duras del
 * privilegio, y devuelve un payload mínimo para selectores. Se reutiliza para
 * poblar la UI y para revalidar en el servidor (ver guards.ts) — así nunca
 * pueden discrepar.
 */
export async function getEligiblePublishers(
	db: Database,
	privilegeId: string,
	opts?: { excludeUserIds?: string[]; asOfDate?: string },
): Promise<EligibleUser[]> {
	const [privilege] = await db.select().from(privileges).where(eq(privileges.id, privilegeId)).limit(1);
	if (!privilege || !privilege.active) return [];

	const [ruleBasedRows, directGrantRows] = await Promise.all([
		db
			.select({ id: users.id })
			.from(users)
			.innerJoin(
				theocraticAppointments,
				and(eq(theocraticAppointments.userId, users.id), isNull(theocraticAppointments.endDate)),
			)
			.innerJoin(
				appointmentPrivilegeRules,
				and(
					eq(appointmentPrivilegeRules.appointmentType, theocraticAppointments.appointmentType),
					eq(appointmentPrivilegeRules.privilegeId, privilegeId),
				),
			),
		db
			.select({ id: users.id })
			.from(users)
			.innerJoin(
				userPrivileges,
				and(
					eq(userPrivileges.userId, users.id),
					eq(userPrivileges.privilegeId, privilegeId),
					eq(userPrivileges.active, true),
				),
			),
	]);

	const eligibleIds = Array.from(new Set([...ruleBasedRows, ...directGrantRows].map((r) => r.id)));
	if (eligibleIds.length === 0) return [];

	// D1 admite 100 variables por consulta: los ids se parten en tandas (con 99+ personas con el privilegio, una sola consulta
	// fallaba y dejaba vacías todas las listas de elegibles).
	const extra = [eq(users.congregationStatus, "active"), notHiddenAdmin];
	if (opts?.excludeUserIds?.length) extra.push(notInArray(users.id, opts.excludeUserIds));

	const rows = (
		await Promise.all(
			chunked(eligibleIds, 60).map((part) =>
				db
					.select({
						id: users.id,
						fullName: users.fullName,
						gender: users.gender,
						householdId: users.householdId,
						birthDate: users.birthDate,
						guardianUserId: users.guardianUserId,
							theocraticStatus: users.theocraticStatus,
					})
					.from(users)
					.where(and(inArray(users.id, part), ...extra)),
			),
		)
	).flat();

	const asOfDate = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);
	return applyPrivilegeConstraints(privilege, rows, asOfDate);
}

/** Elegibilidad de TODOS los privilegios con una carga única (5 consultas en total), para pantallas que necesitan muchos privilegios
 * a la vez (asignación automática) sin pasar del límite de consultas por invocación. */
export interface EligibilityContext {
	privileges: Map<string, PrivilegeConstraints & { id: string; active: boolean }>;
	/** privilegio → tipos de nombramiento que lo otorgan */
	rules: Map<string, Set<string>>;
	/** usuario → tipos de nombramiento vigentes */
	appointments: Map<string, Set<string>>;
	/** privilegio → usuarios con concesión directa activa */
	grants: Map<string, Set<string>>;
	/** personas activas y no ocultas */
	users: Map<string, EligibilityUserRow>;
}

export async function loadEligibilityContext(db: Database): Promise<EligibilityContext> {
	const [privilegeRows, ruleRows, appointmentRows, grantRows, userRows] = await Promise.all([
		db.select().from(privileges),
		db.select().from(appointmentPrivilegeRules),
		db
			.select({ userId: theocraticAppointments.userId, appointmentType: theocraticAppointments.appointmentType })
			.from(theocraticAppointments)
			.where(isNull(theocraticAppointments.endDate)),
		db
			.select({ userId: userPrivileges.userId, privilegeId: userPrivileges.privilegeId })
			.from(userPrivileges)
			.where(eq(userPrivileges.active, true)),
		db
			.select({
				id: users.id,
				fullName: users.fullName,
				gender: users.gender,
				householdId: users.householdId,
				birthDate: users.birthDate,
				guardianUserId: users.guardianUserId,
				theocraticStatus: users.theocraticStatus,
			})
			.from(users)
			.where(and(eq(users.congregationStatus, "active"), notHiddenAdmin)),
	]);

	const rules = new Map<string, Set<string>>();
	for (const r of ruleRows) (rules.get(r.privilegeId) ?? rules.set(r.privilegeId, new Set()).get(r.privilegeId)!).add(r.appointmentType);
	const appointments = new Map<string, Set<string>>();
	for (const a of appointmentRows) (appointments.get(a.userId) ?? appointments.set(a.userId, new Set()).get(a.userId)!).add(a.appointmentType);
	const grants = new Map<string, Set<string>>();
	for (const g of grantRows) (grants.get(g.privilegeId) ?? grants.set(g.privilegeId, new Set()).get(g.privilegeId)!).add(g.userId);

	return {
		privileges: new Map(privilegeRows.map((p) => [p.id, p])),
		rules,
		appointments,
		grants,
		users: new Map(userRows.map((u) => [u.id, u])),
	};
}

/** Misma decisión que `getEligiblePublishers`, pero sobre un contexto ya cargado (sin consultas). */
export function eligibleFromContext(
	ctx: EligibilityContext,
	privilegeId: string,
	opts?: { excludeUserIds?: Iterable<string>; asOfDate?: string },
): EligibleUser[] {
	const privilege = ctx.privileges.get(privilegeId);
	if (!privilege || !privilege.active) return [];
	const ruleTypes = ctx.rules.get(privilegeId) ?? new Set<string>();
	const granted = ctx.grants.get(privilegeId) ?? new Set<string>();
	const exclude = new Set(opts?.excludeUserIds ?? []);
	const rows: EligibilityUserRow[] = [];
	for (const user of ctx.users.values()) {
		if (exclude.has(user.id)) continue;
		const byAppointment = [...(ctx.appointments.get(user.id) ?? [])].some((type) => ruleTypes.has(type));
		if (byAppointment || granted.has(user.id)) rows.push(user);
	}
	return applyPrivilegeConstraints(privilege, rows, opts?.asOfDate ?? new Date().toISOString().slice(0, 10));
}

/** Regla S-38 §7,8,10: el ayudante de una asignación de estudiante debe ser
 * del mismo sexo, o familiar (mismo `householdId`). */
export function isValidAssistantPairing(
	main: { gender: string; householdId: string | null },
	assistant: { gender: string; householdId: string | null },
): boolean {
	const sameSex = main.gender === assistant.gender;
	const sameHousehold = main.householdId !== null && main.householdId === assistant.householdId;
	return sameSex || sameHousehold;
}

export type PioneerAppointmentType = "auxiliary_pioneer" | "regular_pioneer" | null;

/** Nombramiento de precursorado activo de un publicador (auxiliar o regular),
 * si tiene alguno — determina qué campos del informe S-4 aplican (ver
 * S4Form). */
export async function getPioneerAppointmentType(db: Database, userId: string): Promise<PioneerAppointmentType> {
	const [row] = await db
		.select({ appointmentType: theocraticAppointments.appointmentType })
		.from(theocraticAppointments)
		.where(
			and(
				eq(theocraticAppointments.userId, userId),
				isNull(theocraticAppointments.endDate),
				inArray(theocraticAppointments.appointmentType, ["auxiliary_pioneer", "regular_pioneer"]),
			),
		)
		.limit(1);
	return (row?.appointmentType as "auxiliary_pioneer" | "regular_pioneer" | undefined) ?? null;
}

/** Códigos de los privilegios activos de un publicador — se incrusta en el
 * JWT de acceso para evitar un round-trip extra en cada request. */
export async function getActivePrivilegeCodes(db: Database, userId: string): Promise<string[]> {
	const [ruleRows, directRows] = await Promise.all([
		db
			.select({ code: privileges.code })
			.from(privileges)
			.innerJoin(appointmentPrivilegeRules, eq(appointmentPrivilegeRules.privilegeId, privileges.id))
			.innerJoin(
				theocraticAppointments,
				and(
					eq(theocraticAppointments.appointmentType, appointmentPrivilegeRules.appointmentType),
					eq(theocraticAppointments.userId, userId),
					isNull(theocraticAppointments.endDate),
				),
			),
		db
			.select({ code: privileges.code })
			.from(privileges)
			.innerJoin(
				userPrivileges,
				and(
					eq(userPrivileges.privilegeId, privileges.id),
					eq(userPrivileges.userId, userId),
					eq(userPrivileges.active, true),
				),
			),
	]);

	return Array.from(new Set([...ruleRows, ...directRows].map((r) => r.code)));
}
