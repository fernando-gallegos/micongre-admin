import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { fieldServiceGroups, serviceReports, theocraticAppointments, users } from "@/db/schema";
import { RbacError } from "@/lib/rbac/errors";
import { getReportsGroupIds } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import type { BuilderContext } from "../registry";
import type { Cell, ReportBlock, ReportDoc } from "../types";

const MONTH_NAMES = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Informes del mes por grupo de servicio: una tabla por grupo (alfabético; los sin grupo al final) con las columnas de la S-21 y totales. Mismo alcance que la pestaña «Grupos». */
export async function buildInformesGrupos({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	const now = new Date();
	const match = /^(\d{4})-(\d{1,2})$/.exec(params.get("month") ?? "");
	const year = match ? Number(match[1]) : now.getFullYear();
	const month = match ? Number(match[2]) : now.getMonth() + 1;
	if (month < 1 || month > 12) throw new Error("invalid_month");

	const conditions = [eq(users.congregationStatus, "active"), notHiddenAdmin];
	const groupIds = await getReportsGroupIds(db, session);
	if (groupIds !== null) {
		if (groupIds.length === 0) throw new RbacError("No supervisas ningún grupo de servicio.");
		conditions.push(inArray(users.fieldServiceGroupId, groupIds));
	}

	const rows = await db
		.select({
			fullName: users.fullName,
			groupId: users.fieldServiceGroupId,
			groupName: fieldServiceGroups.name,
			reportId: serviceReports.id,
			participated: serviceReports.participatedInMinistry,
			auxiliary: serviceReports.isAuxiliaryPioneerThisMonth,
			hours: serviceReports.hours,
			projectHours: serviceReports.projectHours,
			studies: serviceReports.bibleStudiesCount,
			comments: serviceReports.comments,
			creditNote: serviceReports.creditHoursNote,
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
		.where(and(...conditions))
		.orderBy(asc(users.fullName));

	const byGroup = new Map<string, typeof rows>();
	for (const r of rows) byGroup.set(r.groupName ?? "Sin grupo", [...(byGroup.get(r.groupName ?? "Sin grupo") ?? []), r]);
	const groups = [...byGroup.entries()].sort(([a], [b]) =>
		a === "Sin grupo" ? 1 : b === "Sin grupo" ? -1 : a.localeCompare(b, "es", { numeric: true }),
	);

	const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;
	const delivered = rows.filter((r) => r.reportId).length;
	const blocks: ReportBlock[] = groups.map(([name, items]) => {
		const sum = (pick: (r: (typeof rows)[number]) => number | null | undefined) => items.reduce((s, r) => s + (pick(r) ?? 0), 0);
		// Horas de proyectos: la columna sale si el grupo tiene algún precursor regular (o ya hay horas guardadas).
		const showProject = items.some((r) => r.pioneerType === "regular_pioneer" || (r.projectHours ?? 0) > 0);
		const project = (v: Cell): Cell[] => (showProject ? [v] : []);
		const body: Cell[][] = items.map((r) => [
			r.fullName,
			r.reportId ? (r.participated ? "Sí" : "No") : "",
			r.studies || null,
			r.reportId ? (r.auxiliary ? "Sí" : "No") : "",
			r.hours || null,
			...project(r.projectHours || null),
			[r.creditNote, r.comments].filter(Boolean).join(" · ") || (r.reportId ? "" : "Falta"),
		]);
		body.push([
			"Total",
			items.filter((r) => r.reportId && r.participated).length || null,
			sum((r) => r.studies) || null,
			items.filter((r) => r.reportId && r.auxiliary).length || null,
			sum((r) => r.hours) || null,
			...project(sum((r) => r.projectHours) || null),
			"",
		]);
		return {
			type: "table" as const,
			caption: `${name} · ${items.filter((r) => r.reportId).length} de ${items.length} entregados`,
			table: {
				sheetName: name.slice(0, 31),
				columns: [
					{ label: "Nombre", width: 3 },
					{ label: "Participó", align: "center" as const },
					{ label: "Cursos", align: "center" as const },
					{ label: "Aux.", align: "center" as const },
					{ label: "Horas", align: "center" as const },
					...(showProject ? [{ label: "Proyecto", align: "center" as const }] : []),
					{ label: "Notas", width: 3 },
				],
				rows: body,
			},
		};
	});

	return {
		title: "Informes por grupo",
		subtitle: `${periodLabel} · ${delivered} de ${rows.length} entregados`,
		fileName: `Informes por grupo ${year}-${String(month).padStart(2, "0")}`,
		landscape: true,
		footer: "Mi Congre",
		blocks,
	};
}
