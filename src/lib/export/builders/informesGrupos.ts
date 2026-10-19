import { loadGroupReports, showProjectColumn } from "@/lib/reports/groups";
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

	const groups = await loadGroupReports(db, session, year, month);
	const rows = groups.flatMap((g) => g.items);

	const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;
	const delivered = rows.filter((r) => r.reportId).length;
	const blocks: ReportBlock[] = groups.map(({ name, items }) => {
		const sum = (pick: (r: (typeof rows)[number]) => number | null | undefined) => items.reduce((s, r) => s + (pick(r) ?? 0), 0);
		// Horas de proyectos: la columna sale si el grupo tiene algún precursor regular (o ya hay horas guardadas).
		const showProject = showProjectColumn(items);
		const project = (v: Cell): Cell[] => (showProject ? [v] : []);
		const body: Cell[][] = items.map((r) => [
			r.fullName,
			r.reportId ? (r.participatedInMinistry ? "Sí" : "No") : "",
			r.bibleStudiesCount || null,
			r.reportId ? (r.isAuxiliaryPioneerThisMonth ? "Sí" : "No") : "",
			r.hours || null,
			...project(r.projectHours || null),
			[r.creditHoursNote, r.comments].filter(Boolean).join(" · ") || (r.reportId ? "" : "Falta"),
		]);
		body.push([
			"Total",
			items.filter((r) => r.reportId && r.participatedInMinistry).length || null,
			sum((r) => r.bibleStudiesCount) || null,
			items.filter((r) => r.reportId && r.isAuxiliaryPioneerThisMonth).length || null,
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
