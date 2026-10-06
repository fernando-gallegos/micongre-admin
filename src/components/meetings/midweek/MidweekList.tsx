"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton, PageHeader } from "@/components/ui/Layout";
import { ExportButton } from "@/components/export/ExportButton";
import { MwbImportDialog } from "./MwbImportDialog";
import { WeekBuilder } from "./WeekBuilder";
import { WeekNav } from "@/components/shared/WeekNav";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";

interface MeetingRow {
	id: string;
}

export function MidweekList() {
	const [weekStart, setWeekStart] = useState(() => toISODate(mondayOf(new Date())));
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [importOpen, setImportOpen] = useState(false);

	const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));

	const load = useCallback(async () => {
		setLoading(true);
		const response = await fetch(`/api/midweek?from=${weekStart}&to=${weekEnd}`);
		if (response.ok) {
			const body = (await response.json()) as { items: MeetingRow[] };
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
								{ label: "Esta semana", params: { scope: "week" } },
								{ label: "Ambas reuniones de la semana", kind: "meetings-week", params: {} },
								{ label: "Todo el mes", params: { scope: "month" } },
								{ label: "Programa del mes (S-140)", kind: "s140", params: { scope: "month" } },
								{ label: "Papeletas de la semana (S-89)", kind: "s89", params: { scope: "week" } },
							]}
							label="Descargar reporte"
							title="Reporte de entre semana"
						/>
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

			{!loading && rows[0] && <WeekBuilder meetingId={rows[0].id} />}

			<MwbImportDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
				weekStart={weekStart}
				onImported={load}
			/>
		</div>
	);
}
