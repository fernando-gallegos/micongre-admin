"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton, PageHeader } from "@/components/ui/Layout";
import { ExportButton } from "@/components/export/ExportButton";
import { MwbImportDialog } from "./MwbImportDialog";
import { WeekBuilder } from "./WeekBuilder";
import { MonthPlannerButton } from "@/components/planner/MonthPlanner";
import { WeekNav, useStoredWeek } from "@/components/shared/WeekNav";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";

interface MeetingRow {
	id: string;
}

export function MidweekList() {
	const [weekStart, setWeekStart] = useStoredWeek("midweek");
	// Sube al cerrar la vista mensual: la semana se vuelve a leer con lo que se guardó allí.
	const [monthVersion, setMonthVersion] = useState(0);
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [importOpen, setImportOpen] = useState(false);

	const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));

	// Cada carga lleva un número: si mientras tanto se pidió otra semana, la respuesta vieja se descarta.
	const loadSeq = useRef(0);
	const load = useCallback(async () => {
		const seq = ++loadSeq.current;
		setLoading(true);
		const response = await fetch(`/api/midweek?from=${weekStart}&to=${weekEnd}`);
		if (seq !== loadSeq.current) return;
		if (response.ok) {
			const body = (await response.json()) as { items: MeetingRow[] };
			if (seq !== loadSeq.current) return;
			setRows(body.items);
		}
		setLoading(false);
	}, [weekStart, weekEnd]);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title="Entre semana"
				subtitle="Reunión Vida y Ministerio Cristianos"
				actions={
					<>
						<ExportButton
							kind="midweek"
							params={{ date: weekStart }}
							variants={[
								{ label: "Esta semana", kind: "s140", params: { scope: "week" } },
								{ label: "Todo el mes", kind: "s140", params: { scope: "month" } },
								{ label: "Rango de fechas", kind: "s140", params: {}, range: true },
								{ label: "Hojas de asignación", kind: "s89", params: { scope: "week" } },
							]}
							label="Descargar reporte"
							title="Reporte de entre semana"
						/>
						<MonthPlannerButton module="midweek" date={weekStart} onClosed={() => setMonthVersion((v) => v + 1)} />
						<IconButton label="Importar de JW.ORG" icon={Download} tone="accent" onClick={() => setImportOpen(true)} />
					</>
				}
			/>

			<WeekNav weekStart={weekStart} onChange={setWeekStart} />

			{!loading && rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">
						No hay reunión programada para esta semana. Usa el ícono de descarga para importarla de JW.ORG.
					</p>
				</Card>
			)}

			{!loading && rows[0] && <WeekBuilder key={`${rows[0].id}:${monthVersion}`} meetingId={rows[0].id} />}

			<MwbImportDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
				weekStart={weekStart}
				onImported={load}
			/>
		</div>
	);
}
