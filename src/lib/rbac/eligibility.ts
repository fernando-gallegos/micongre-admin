import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	appointmentPrivilegeRules,
	privileges,
	theocraticAppointments,
	userPrivileges,
	users,
} from "@/db/schema";
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

	const conditions = [inArray(users.id, eligibleIds), eq(users.congregationStatus, "active"), notHiddenAdmin];
	if (privilege.requiresMale) conditions.push(eq(users.gender, "male"));
	if (privilege.requiresBaptized) conditions.push(eq(users.theocraticStatus, "baptized_publisher"));
	if (opts?.excludeUserIds?.length) conditions.push(notInArray(users.id, opts.excludeUserIds));

	const rows = await db
		.select({
			id: users.id,
			fullName: users.fullName,
			gender: users.gender,
			householdId: users.householdId,
			birthDate: users.birthDate,
			guardianUserId: users.guardianUserId,
		})
		.from(users)
		.where(and(...conditions));

	const asOfDate = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);
	const filtered = privilege.requiresAdult
		? rows.filter(
				(r) =>
					isAdult(r.birthDate, asOfDate) ||
					(privilege.allowsMinorWithParentalConsent && r.guardianUserId !== null),
			)
		: rows;

	return filtered.map(({ id, fullName, gender, householdId }) => ({ id, fullName, gender, householdId }));
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
