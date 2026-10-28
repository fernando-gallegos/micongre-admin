import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
	APPOINTMENT_TYPES,
	CONGREGATION_ROW_ID,
	congregations,
	theocraticAppointments,
	userPrivileges,
	users,
} from "@/db/schema";
import { SERVICE_COMMITTEE_APPOINTMENTS } from "@/lib/rbac/roles";

const addRemove = <T extends z.ZodTypeAny>(item: T) =>
	z.object({ add: z.array(item).default([]), remove: z.array(item).default([]) });

export const bulkSchema = z.object({
	userIds: z.array(z.string().min(1)).min(1).max(500),
	privileges: addRemove(z.string().min(1)).optional(),
	appointments: addRemove(z.enum(APPOINTMENT_TYPES)).optional(),
});
export type BulkInput = z.infer<typeof bulkSchema>;

// Matriz: cambios por persona (cada una con lo que se le agrega y se le quita).
export const matrixSchema = z.object({
	changes: z
		.array(
			z.object({
				userId: z.string().min(1),
				privileges: addRemove(z.string().min(1)).optional(),
				appointments: addRemove(z.enum(APPOINTMENT_TYPES)).optional(),
			}),
		)
		.min(1)
		.max(3000),
});
export type MatrixInput = z.infer<typeof matrixSchema>;

/** Aplica los cambios de la matriz agrupando a las personas que reciben exactamente lo mismo (una pasada por grupo). */
export async function applyMatrix(
	db: Database,
	input: MatrixInput,
	opts: { actorId: string; skipAdmins: boolean; doPrivileges: boolean; doAppointments: boolean },
): Promise<BulkResult> {
	const total: BulkResult = { privilegesGranted: 0, privilegesRevoked: 0, appointmentsStarted: 0, appointmentsEnded: 0, skipped: [], warnings: [] };
	// Coordinador / secretario / superintendente de servicio: una sola persona por cargo.
	const committeeCount = new Map<string, number>();
	for (const c of input.changes) {
		for (const t of c.appointments?.add ?? []) if (COMMITTEE.includes(t)) committeeCount.set(t, (committeeCount.get(t) ?? 0) + 1);
	}
	if ([...committeeCount.values()].some((n) => n > 1)) throw new BulkError("committee_single");

	const groups = new Map<string, { userIds: string[]; privileges?: { add: string[]; remove: string[] }; appointments?: { add: (typeof APPOINTMENT_TYPES)[number][]; remove: (typeof APPOINTMENT_TYPES)[number][] } }>();
	for (const c of input.changes) {
		const privileges = c.privileges && (c.privileges.add.length || c.privileges.remove.length) ? { add: [...c.privileges.add].sort(), remove: [...c.privileges.remove].sort() } : undefined;
		const appointments = c.appointments && (c.appointments.add.length || c.appointments.remove.length) ? { add: [...c.appointments.add].sort(), remove: [...c.appointments.remove].sort() } : undefined;
		if (!privileges && !appointments) continue;
		const key = JSON.stringify({ privileges, appointments });
		const group = groups.get(key) ?? { userIds: [], privileges, appointments };
		group.userIds.push(c.userId);
		groups.set(key, group);
	}
	for (const g of groups.values()) {
		const r = await applyBulk(db, { userIds: g.userIds, privileges: g.privileges, appointments: g.appointments }, opts);
		total.privilegesGranted += r.privilegesGranted;
		total.privilegesRevoked += r.privilegesRevoked;
		total.appointmentsStarted += r.appointmentsStarted;
		total.appointmentsEnded += r.appointmentsEnded;
		total.skipped.push(...r.skipped);
		total.warnings.push(...r.warnings);
	}
	return total;
}

const COMMITTEE = SERVICE_COMMITTEE_APPOINTMENTS as readonly string[];

function chunks<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

export class BulkError extends Error {
	constructor(public code: "committee_single") {
		super(code);
	}
}

export interface BulkResult {
	privilegesGranted: number;
	privilegesRevoked: number;
	appointmentsStarted: number;
	appointmentsEnded: number;
	skipped: { userId: string; reason: string }[];
	warnings: string[];
}

/** Aplica agregar/quitar de privilegios y nombramientos a varias personas. Es aditivo: lo que no se nombra no se toca.
 * Los permisos de quien llama ya se validaron en la ruta; aquí `skipAdmins` deja fuera a los administradores (quien no es admin
 * no puede tocar sus cuentas). Los D1 limitan a 100 variables por sentencia, por eso los inArray se trocean. */
export async function applyBulk(
	db: Database,
	input: BulkInput,
	opts: { actorId: string; skipAdmins: boolean; doPrivileges: boolean; doAppointments: boolean },
): Promise<BulkResult> {
	const result: BulkResult = {
		privilegesGranted: 0,
		privilegesRevoked: 0,
		appointmentsStarted: 0,
		appointmentsEnded: 0,
		skipped: [],
		warnings: [],
	};
	const today = new Date().toISOString().slice(0, 10);

	// Personas válidas: existen, no son el administrador oculto y (si quien llama no es admin) no son admin.
	const found: { id: string; systemRole: string; isHiddenAdmin: boolean }[] = [];
	for (const part of chunks([...new Set(input.userIds)], 90)) {
		found.push(
			...(await db
				.select({ id: users.id, systemRole: users.systemRole, isHiddenAdmin: users.isHiddenAdmin })
				.from(users)
				.where(inArray(users.id, part))),
		);
	}
	const valid = new Set<string>();
	for (const id of new Set(input.userIds)) {
		const u = found.find((f) => f.id === id);
		if (!u || u.isHiddenAdmin) result.skipped.push({ userId: id, reason: "no_encontrado" });
		else if (opts.skipAdmins && u.systemRole === "admin") result.skipped.push({ userId: id, reason: "administrador" });
		// Quien no es admin no puede cambiarse sus propios privilegios (se daría cualquiera con «Administrar cuentas»).
		else if (opts.skipAdmins && input.privileges && id === opts.actorId) result.skipped.push({ userId: id, reason: "propia_cuenta" });
		else valid.add(id);
	}
	const ids = [...valid];
	if (ids.length === 0) return result;

	// --- Privilegios ---
	const priv = opts.doPrivileges ? input.privileges : undefined;
	if (priv) {
		const addIds = priv.add.filter((p) => !priv.remove.includes(p));
		const removeIds = priv.remove;
		const all = [...new Set([...addIds, ...removeIds])];
		if (all.length > 0) {
			const active = new Set<string>();
			for (const part of chunks(ids, Math.max(1, 90 - all.length))) {
				const rows = await db
					.select({ userId: userPrivileges.userId, privilegeId: userPrivileges.privilegeId })
					.from(userPrivileges)
					.where(and(inArray(userPrivileges.userId, part), inArray(userPrivileges.privilegeId, all), eq(userPrivileges.active, true)));
				for (const r of rows) active.add(`${r.userId}|${r.privilegeId}`);
			}
			const statements = [];
			for (const userId of ids) {
				for (const privilegeId of addIds) {
					if (active.has(`${userId}|${privilegeId}`)) continue;
					statements.push(
						db
							.insert(userPrivileges)
							.values({ userId, privilegeId, approvedAt: today, approvedByUserId: opts.actorId, active: true })
							.onConflictDoUpdate({
								target: [userPrivileges.userId, userPrivileges.privilegeId],
								set: { active: true, approvedAt: today, approvedByUserId: opts.actorId, revokedAt: null },
							}),
					);
					result.privilegesGranted++;
				}
				for (const privilegeId of removeIds) {
					if (!active.has(`${userId}|${privilegeId}`)) continue;
					statements.push(
						db
							.update(userPrivileges)
							.set({ active: false, revokedAt: today })
							.where(and(eq(userPrivileges.userId, userId), eq(userPrivileges.privilegeId, privilegeId))),
					);
					result.privilegesRevoked++;
				}
			}
			for (const part of chunks(statements, 50)) await db.batch(part as [(typeof statements)[number], ...(typeof statements)[number][]]);
		}
	}

	// --- Nombramientos ---
	const appt = opts.doAppointments ? input.appointments : undefined;
	if (appt) {
		const addTypes = appt.add.filter((t) => !appt.remove.includes(t));
		const removeTypes = appt.remove;
		const committeeAdd = addTypes.filter((t) => COMMITTEE.includes(t));
		// Cobe / secretario / superintendente de servicio: una sola persona a la vez.
		if (committeeAdd.length > 0 && ids.length > 1) throw new BulkError("committee_single");
		const all = [...new Set([...addTypes, ...removeTypes])];
		if (all.length > 0) {
			const active = new Set<string>();
			for (const part of chunks(ids, Math.max(1, 90 - all.length))) {
				const rows = await db
					.select({ userId: theocraticAppointments.userId, type: theocraticAppointments.appointmentType })
					.from(theocraticAppointments)
					.where(
						and(
							inArray(theocraticAppointments.userId, part),
							inArray(theocraticAppointments.appointmentType, all),
							isNull(theocraticAppointments.endDate),
						),
					);
				for (const r of rows) active.add(`${r.userId}|${r.type}`);
			}

			// A quien ya lo tuviera se le quita, con aviso.
			if (committeeAdd.length > 0) {
				const holders = await db
					.select({
						id: theocraticAppointments.id,
						userId: theocraticAppointments.userId,
						type: theocraticAppointments.appointmentType,
						name: users.fullName,
					})
					.from(theocraticAppointments)
					.innerJoin(users, eq(users.id, theocraticAppointments.userId))
					.where(and(inArray(theocraticAppointments.appointmentType, committeeAdd), isNull(theocraticAppointments.endDate)));
				for (const h of holders.filter((h) => h.userId !== ids[0])) {
					await db.update(theocraticAppointments).set({ endDate: today }).where(eq(theocraticAppointments.id, h.id));
					result.warnings.push(`Solo una persona puede tener "${h.type}" a la vez: se le quitó a ${h.name}.`);
				}
			}

			const statements = [];
			for (const userId of ids) {
				for (const appointmentType of addTypes) {
					if (active.has(`${userId}|${appointmentType}`)) continue;
					statements.push(db.insert(theocraticAppointments).values({ userId, appointmentType, startDate: today }));
					result.appointmentsStarted++;
				}
				for (const appointmentType of removeTypes) {
					if (!active.has(`${userId}|${appointmentType}`)) continue;
					statements.push(
						db
							.update(theocraticAppointments)
							.set({ endDate: today })
							.where(
								and(
									eq(theocraticAppointments.userId, userId),
									eq(theocraticAppointments.appointmentType, appointmentType),
									isNull(theocraticAppointments.endDate),
								),
							),
					);
					result.appointmentsEnded++;
				}
			}
			for (const part of chunks(statements, 50)) await db.batch(part as [(typeof statements)[number], ...(typeof statements)[number][]]);

			// Comité de servicio: se resincroniza desde los nombramientos vigentes (única fuente de verdad, sfg 1:10).
			if (committeeAdd.length > 0 || removeTypes.some((t) => COMMITTEE.includes(t))) {
				const holders = await db
					.select({ userId: theocraticAppointments.userId, type: theocraticAppointments.appointmentType })
					.from(theocraticAppointments)
					.where(and(inArray(theocraticAppointments.appointmentType, [...SERVICE_COMMITTEE_APPOINTMENTS]), isNull(theocraticAppointments.endDate)));
				const byType: Record<string, string> = Object.fromEntries(holders.map((h) => [h.type, h.userId]));
				const update = {
					cobeUserId: byType.cobe ?? null,
					secretaryUserId: byType.secretary ?? null,
					serviceOverseerUserId: byType.service_overseer ?? null,
				};
				const [existing] = await db.select({ id: congregations.id }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
				if (existing) await db.update(congregations).set({ ...update, updatedAt: new Date() }).where(eq(congregations.id, CONGREGATION_ROW_ID));
				else await db.insert(congregations).values({ id: CONGREGATION_ROW_ID, name: "Mi congregación", ...update });
			}
		}
	}
	return result;
}
