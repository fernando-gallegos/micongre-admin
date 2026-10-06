"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/Layout";
import { ExportButton } from "@/components/export/ExportButton";
import { WeekendDetail } from "./WeekendDetail";
import { OutgoingTalksList } from "./OutgoingTalksList";
import { WeekNav } from "@/components/shared/WeekNav";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";

interface MeetingRow {
	id: string;
}

export function WeekendList() {
	const [weekStart, setWeekStart] = useState(() => toISODate(mondayOf(new Date())));
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [generateError, setGenerateError] = useState(false);

	const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));

	const load = useCallback(async () => {
		setLoading(true);
		const response = await fetch(`/api/weekend?from=${weekStart}&to=${weekEnd}`);
		if (response.ok) {
			const body = (await response.json()) as { items: MeetingRow[] };
			setRows(body.items);
		}
		setLoading(false);
	}, [weekStart, weekEnd]);

	useEffect(() => {
		load();
	}, [load]);

	// Agrega, sin preguntar, las reuniones de todo el mes que no existan todavía.
	async function generateMonth() {
		setGenerating(true);
		setGenerateError(false);
		const response = await fetch("/api/weekend/month", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ weekStart }),
		});
		setGenerating(false);
		if (!response.ok) {
			setGenerateError(true);
			return;
		}
		load();
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="w-full min-w-0 sm:w-auto">
					<WeekNav weekStart={weekStart} onChange={setWeekStart} />
				</div>
				<div className="ml-auto flex items-center gap-1">
					<ExportButton
						kind="weekend"
						params={{ date: weekStart }}
						variants={[
							{ label: "Esta semana", params: { scope: "week" } },
							{ label: "Ambas reuniones de la semana", kind: "meetings-week", params: {} },
							{ label: "Todo el mes", params: { scope: "month" } },
							{ label: "Programa del mes (diseño S-140)", kind: "weekend-program", params: { scope: "month" } },
						]}
						label="Descargar reporte"
						title="Reporte de fin de semana"
					/>
					<IconButton
						label="Agregar las reuniones del mes"
						icon={Download}
						tone="accent"
						disabled={generating}
						onClick={generateMonth}
					/>
				</div>
			</div>
			{generateError && <p className="text-sm text-red-600">No se pudieron agregar las reuniones del mes.</p>}

			{!loading && rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">
						No hay reunión programada para esta semana. Usa el ícono de descarga para agregar las del mes.
					</p>
				</Card>
			)}

			{!loading && rows[0] && <WeekendDetail meetingId={rows[0].id} />}

			<OutgoingTalksList weekStart={weekStart} weekEnd={weekEnd} />
		</div>
	);
}
