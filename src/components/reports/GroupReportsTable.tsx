"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ExportButton } from "@/components/export/ExportButton";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/Layout";

interface Item {
	userId: string;
	fullName: string;
	reportId: string | null;
	participatedInMinistry: boolean | null;
	isAuxiliaryPioneerThisMonth: boolean | null;
	hours: number | null;
	projectHours: number | null;
	bibleStudiesCount: number | null;
	comments: string | null;
	pioneerType: "auxiliary_pioneer" | "regular_pioneer" | null;
}

interface Group {
	id: string | null;
	name: string;
	items: Item[];
}

const MONTH_NAMES = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const now = new Date();
// Alineación aparte: text-center y text-left juntos no se anulan por orden de clase (gana el que va después en el CSS).
const TH_BASE = "px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft";
const TD_BASE = "px-2 py-2 text-sm text-ink";
const TH = `${TH_BASE} text-center`;
const TD = `${TD_BASE} text-center`;
const THL = `${TH_BASE} text-left`;
const TDL = `${TD_BASE} text-left`;

function num(value: number | null | undefined) {
	return value ? String(value) : "";
}

/** Pestaña «Grupos» de Informes: los datos de la S-21 de todos (o de tu grupo) en un mes, una tabla por grupo. */
export function GroupReportsTable() {
	const [year, setYear] = useState(now.getFullYear());
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [groups, setGroups] = useState<Group[]>([]);
	const [loading, setLoading] = useState(true);
	const [forbidden, setForbidden] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setForbidden(false);
		const response = await fetch(`/api/reports/groups?year=${year}&month=${month}`);
		if (response.status === 403) {
			setForbidden(true);
			setGroups([]);
		} else if (response.ok) {
			setGroups(((await response.json()) as { groups: Group[] }).groups);
		}
		setLoading(false);
	}, [year, month]);

	useEffect(() => {
		load();
	}, [load]);

	function shiftMonth(delta: number) {
		const d = new Date(year, month - 1 + delta, 1);
		setYear(d.getFullYear());
		setMonth(d.getMonth() + 1);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex h-12 items-center justify-between rounded-full bg-surface px-1">
				<IconButton label="Mes anterior" icon={ChevronLeft} onClick={() => shiftMonth(-1)} />
				<span className="text-[15px] font-semibold text-ink">
					{MONTH_NAMES[month - 1]} {year}
				</span>
				<div className="flex items-center">
					{!forbidden && (
						<ExportButton
							kind="reports-groups"
							params={{ month: `${year}-${String(month).padStart(2, "0")}` }}
							formats={["xlsx", "docx", "png"]}
							label="Descargar informes por grupo"
							title="Descargar informes por grupo"
						/>
					)}
					<IconButton label="Mes siguiente" icon={ChevronRight} onClick={() => shiftMonth(1)} />
				</div>
			</div>

			{forbidden && (
				<Card>
					<p className="text-sm text-ink-soft">No supervisas ningún grupo de servicio, así que no tienes informes que revisar aquí.</p>
				</Card>
			)}
			{!loading && !forbidden && groups.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">No hay publicadores en tu alcance.</p>
				</Card>
			)}

			{groups.map((group) => {
				const delivered = group.items.filter((i) => i.reportId).length;
				const totalHours = group.items.reduce((sum, i) => sum + (i.hours ?? 0), 0);
				const totalStudies = group.items.reduce((sum, i) => sum + (i.bibleStudiesCount ?? 0), 0);
				const totalProject = group.items.reduce((sum, i) => sum + (i.projectHours ?? 0), 0);
				// Horas de proyectos: solo cuentan los precursores regulares; la columna sale si el grupo tiene alguno (o ya hay horas guardadas).
				const showProject = group.items.some((i) => i.pioneerType === "regular_pioneer" || (i.projectHours ?? 0) > 0);
				return (
					<section key={group.id ?? "none"} className="flex flex-col gap-2">
						<div className="flex items-baseline justify-between px-1">
							<h2 className="text-[15px] font-semibold text-ink">{group.name}</h2>
							<span className="text-xs text-ink-soft">
								{delivered} de {group.items.length} entregados
							</span>
						</div>
						<div className="overflow-x-auto rounded-2xl bg-surface">
							<table className="w-full min-w-[600px] border-collapse">
								<thead>
									<tr className="border-b border-line">
										<th className={THL}>Nombre</th>
										<th className={TH}>Participó</th>
										<th className={TH}>Cursos</th>
										<th className={TH}>Aux.</th>
										<th className={TH}>Horas</th>
										{showProject && <th className={TH}>Proyecto</th>}
										<th className={THL}>Notas</th>
									</tr>
								</thead>
								<tbody>
									{group.items.map((i) => (
										<tr key={i.userId} className="border-b border-line last:border-0">
											<td className={TDL}>
												<span className={i.reportId ? "" : "text-ink-soft"}>{i.fullName}</span>
												{!i.reportId && <span className="ml-2 text-xs font-semibold text-warn">Falta</span>}
											</td>
											<td className={TD}>{i.reportId && i.participatedInMinistry ? <Check className="mx-auto size-4 text-accent" /> : ""}</td>
											<td className={TD}>{num(i.bibleStudiesCount)}</td>
											<td className={TD}>{i.reportId && i.isAuxiliaryPioneerThisMonth ? <Check className="mx-auto size-4 text-accent" /> : ""}</td>
											<td className={TD}>{num(i.hours)}</td>
											{showProject && <td className={TD}>{num(i.projectHours)}</td>}
											<td className="max-w-[200px] truncate px-2 py-2 text-left text-xs text-ink-soft" title={i.comments ?? undefined}>
												{i.comments ?? ""}
											</td>
										</tr>
									))}
								</tbody>
								<tfoot>
									<tr className="border-t border-line bg-surface-alt">
										<td className={`${TDL} font-semibold`}>Total</td>
										<td className={TD}>{group.items.filter((i) => i.reportId && i.participatedInMinistry).length}</td>
										<td className={`${TD} font-semibold`}>{totalStudies || ""}</td>
										<td className={TD}>{group.items.filter((i) => i.reportId && i.isAuxiliaryPioneerThisMonth).length || ""}</td>
										<td className={`${TD} font-semibold`}>{totalHours || ""}</td>
										{showProject && <td className={`${TD} font-semibold`}>{totalProject || ""}</td>}
										<td className={TD} />
									</tr>
								</tfoot>
							</table>
						</div>
					</section>
				);
			})}
		</div>
	);
}
