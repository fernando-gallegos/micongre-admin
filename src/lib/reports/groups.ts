// Informes de un mes agrupados por grupo de servicio: lo comparten la pestaña «Grupos» (`/api/reports/groups`) y su reporte descargable
// (`lib/export/builders/informesGrupos.ts`), para que la pantalla y el archivo nunca muestren cosas distintas.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { fieldServiceGroups, serviceReports, theocraticAppointments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { getReportsGroupIds } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

export const NO_GROUP_NAME = "Sin grupo";

export interface GroupReportRow {
	userId: string;
	fullName: string;
	groupId: string | null;
	groupName: string | null;
	reportId: string | null;
	participatedInMinistry: boolean | null;
	isAuxiliaryPioneerThisMonth: boolean | null;
	hours: number | null;
	projectHours: number | null;
	bibleStudiesCount: number | null;
	comments: string | null;
	creditHoursNote: string | null;
	pioneerType: "auxiliary_pioneer" | "regular_pioneer" | null;
}

export interface GroupReports {
	id: string | null;
	name: string;
	items: GroupReportRow[];
}

/** Agrupa por grupo de servicio: grupos en orden alfabético (con números en orden natural: «Grupo 2» antes que «Grupo 10») y los que no tienen grupo al final. Conserva el orden de las personas dentro de cada grupo. */
export function groupReportRows(rows: GroupReportRow[]): GroupReports[] {
	const byGroup = new Map<string | null, GroupReports>();
	for (const row of rows) {
		const id = row.groupId && row.groupName ? row.groupId : null;
		const group = byGroup.get(id) ?? { id, name: id ? (row.groupName as string) : NO_GROUP_NAME, items: [] };
		group.items.push(row);
		byGroup.set(id, group);
	}
	return [...byGroup.values()].sort((a, b) =>
		a.id === null ? 1 : b.id === null ? -1 : a.name.localeCompare(b.name, "es", { numeric: true }),
	);
}

/** La columna de horas de proyectos sale si el grupo tiene algún precursor regular (o ya hay horas de proyecto guardadas). */
export function showProjectColumn(items: GroupReportRow[]): boolean {
	return items.some((i) => i.pioneerType === "regular_pioneer" || (i.projectHours ?? 0) > 0);
}

/** Informes del mes de las personas activas dentro del alcance de quien consulta (mismo criterio que la tabla S-4). Sin grupos a cargo: RbacError. */
export async function loadGroupReports(db: Database, session: Session, year: number, month: number): Promise<GroupReports[]> {
	const scope = [eq(users.congregationStatus, "active"), notHiddenAdmin];
	const groupIds = await getReportsGroupIds(db, session);
	if (groupIds !== null) {
		if (groupIds.length === 0) throw new RbacError("No supervisas ningún grupo de servicio.");
		scope.push(inArray(users.fieldServiceGroupId, groupIds));
	}

	const rows = await db
		.select({
			userId: users.id,
			fullName: users.fullName,
			groupId: users.fieldServiceGroupId,
			groupName: fieldServiceGroups.name,
			reportId: serviceReports.id,
			participatedInMinistry: serviceReports.participatedInMinistry,
			isAuxiliaryPioneerThisMonth: serviceReports.isAuxiliaryPioneerThisMonth,
			hours: serviceReports.hours,
			projectHours: serviceReports.projectHours,
			bibleStudiesCount: serviceReports.bibleStudiesCount,
			comments: serviceReports.comments,
			creditHoursNote: serviceReports.creditHoursNote,
			pioneerType: theocraticAppointments.appointmentType,
		})
		.from(users)
		.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, users.fieldServiceGroupId))
		.leftJoin(
			serviceReports,
			and(eq(serviceReports.userId, users.id), eq(serviceReports.periodYear, year), eq(serviceReports.periodMonth, month)),
		)
		.leftJoin(
			theocraticAppointments,
			and(
				eq(theocraticAppointments.userId, users.id),
				isNull(theocraticAppointments.endDate),
				inArray(theocraticAppointments.appointmentType, ["auxiliary_pioneer", "regular_pioneer"]),
			),
		)
		.where(and(...scope))
		.orderBy(asc(users.fullName));

	return groupReportRows(rows as GroupReportRow[]);
}
