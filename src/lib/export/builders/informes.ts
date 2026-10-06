import { and, asc, eq, inArray } from "drizzle-orm";
import { fieldServiceGroups, serviceReports, users } from "@/db/schema";
import { RbacError } from "@/lib/rbac/errors";
import { getReportsGroupIds } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import type { BuilderContext } from "../registry";
import type { ReportDoc } from "../types";

const MONTH_NAMES = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Informes del mes (S-4): una fila por publicador activo dentro del alcance del usuario. */
export async function buildInformes({ db, session, params }: BuilderContext): Promise<ReportDoc> {
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
			userId: users.id,
			fullName: users.fullName,
			groupName: fieldServiceGroups.name,
			reportId: serviceReports.id,
			participated: serviceReports.participatedInMinistry,
			auxiliary: serviceReports.isAuxiliaryPioneerThisMonth,
			hours: serviceReports.hours,
			projectHours: serviceReports.projectHours,
			studies: serviceReports.bibleStudiesCount,
			comments: serviceReports.comments,
			creditNote: serviceReports.creditHoursNote,
		})
		.from(users)
		.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, users.fieldServiceGroupId))
		.leftJoin(
			serviceReports,
			and(
				eq(serviceReports.userId, users.id),
				eq(serviceReports.periodYear, year),
				eq(serviceReports.periodMonth, month),
			),
		)
		.where(and(...conditions))
		.orderBy(asc(users.fullName));

	const delivered = rows.filter((r) => r.reportId).length;
	const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

	return {
		title: "Informes de servicio del mes",
		subtitle: `${periodLabel} · ${delivered} de ${rows.length} entregados`,
		fileName: `Informes ${year}-${String(month).padStart(2, "0")}`,
		landscape: true,
		footer: "Mi Congre",
		blocks: [
			{
				type: "table",
				table: {
					sheetName: periodLabel,
					columns: [
						{ label: "Nombre", width: 3 },
						{ label: "Grupo", width: 2 },
						{ label: "Participó", align: "center" },
						{ label: "Precursor auxiliar", align: "center" },
						{ label: "Cursos bíblicos", align: "center" },
						{ label: "Horas", align: "center" },
						{ label: "Horas de proyecto", align: "center" },
						{ label: "Comentarios", width: 3 },
						{ label: "Estado", align: "center" },
					],
					rows: rows.map((r) => [
						r.fullName,
						r.groupName ?? "",
						r.reportId ? (r.participated ? "Sí" : "No") : "",
						r.reportId ? (r.auxiliary ? "Sí" : "No") : "",
						r.studies || null,
						r.hours || null,
						r.projectHours || null,
						[r.creditNote, r.comments].filter(Boolean).join(" · "),
						r.reportId ? "Entregado" : "Falta",
					]),
				},
			},
		],
	};
}
