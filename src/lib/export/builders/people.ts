import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { fieldServiceGroups, households, publicCongregationStatus, theocraticAppointments, users } from "@/db/schema";
import { APPOINTMENT_LABELS } from "@/lib/appointmentLabels";
import { formatShortDate } from "@/lib/dateFormat";
import { CONGREGATION_STATUS_LABELS, THEOCRATIC_STATUS_LABELS } from "@/lib/publisherLabels";
import { assertCanAccessPublishersModule, getOwnFieldServiceGroupId } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { notHiddenAdminOnly } from "@/lib/rbac/visibility";
import type { BuilderContext } from "../registry";
import type { ReportDoc } from "../types";

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
	no_account: "Sin cuenta",
	invited: "Invitado",
	active: "Con acceso",
	disabled: "Deshabilitado",
};
const GENDER_LABEL: Record<string, string> = { male: "Varón", female: "Mujer" };

/** Lista de publicadores (mismo alcance que GET /api/publishers; los sacados se incluyen). */
export async function buildPeople({ db, session }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessPublishersModule(session);

	const conditions = [notHiddenAdminOnly];
	if (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)) {
		const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
		conditions.push(ownGroupId ? eq(users.fieldServiceGroupId, ownGroupId) : eq(users.id, "__none__"));
	}

	const rows = await db
		.select({
			id: users.id,
			fullName: users.fullName,
			gender: users.gender,
			phone: users.phone,
			email: users.email,
			birthDate: users.birthDate,
			baptismDate: users.baptismDate,
			congregationStatus: users.congregationStatus,
			disfellowshipped: users.disfellowshipped,
			theocraticStatus: users.theocraticStatus,
			accountStatus: users.accountStatus,
			groupName: fieldServiceGroups.name,
			householdLabel: households.label,
		})
		.from(users)
		.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, users.fieldServiceGroupId))
		.leftJoin(households, eq(households.id, users.householdId))
		.where(and(...conditions))
		.orderBy(asc(users.fullName));

	const appointmentsByUser = new Map<string, string[]>();
	for (let i = 0; i < rows.length; i += 90) {
		const ids = rows.slice(i, i + 90).map((r) => r.id);
		const apps = await db
			.select({ userId: theocraticAppointments.userId, type: theocraticAppointments.appointmentType })
			.from(theocraticAppointments)
			.where(and(inArray(theocraticAppointments.userId, ids), isNull(theocraticAppointments.endDate)));
		for (const a of apps) {
			const list = appointmentsByUser.get(a.userId) ?? [];
			list.push(APPOINTMENT_LABELS[a.type] ?? a.type);
			appointmentsByUser.set(a.userId, list);
		}
	}

	return {
		title: "Publicadores",
		subtitle: `${rows.length} personas · ${formatShortDate(new Date())}`,
		fileName: "Publicadores",
		landscape: true,
		footer: "Mi Congre",
		blocks: [
			{
				type: "table",
				table: {
					sheetName: "Publicadores",
					columns: [
						{ label: "Nombre", width: 3 },
						{ label: "Sexo" },
						{ label: "Teléfono", width: 2 },
						{ label: "Correo", width: 3 },
						{ label: "Nacimiento", width: 2 },
						{ label: "Bautismo", width: 2 },
						{ label: "Condición" },
						{ label: "Condición teocrática", width: 2 },
						{ label: "Grupo de servicio", width: 2 },
						{ label: "Hogar", width: 2 },
						{ label: "Nombramientos", width: 3 },
						{ label: "Cuenta" },
					],
					rows: rows.map((r) => {
						const status = publicCongregationStatus(r);
						return [
							r.fullName,
							r.gender ? (GENDER_LABEL[r.gender] ?? "") : "",
							r.phone ?? "",
							r.email ?? "",
							r.birthDate ? formatShortDate(r.birthDate) : "",
							r.baptismDate ? formatShortDate(r.baptismDate) : "",
							CONGREGATION_STATUS_LABELS[status] ?? status,
							THEOCRATIC_STATUS_LABELS[r.theocraticStatus] ?? r.theocraticStatus,
							r.groupName ?? "",
							r.householdLabel ?? "",
							(appointmentsByUser.get(r.id) ?? []).join(", "),
							ACCOUNT_STATUS_LABEL[r.accountStatus] ?? r.accountStatus,
						];
					}),
				},
			},
		],
	};
}
