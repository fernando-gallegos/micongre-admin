"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton, PageHeader } from "@/components/ui/Layout";
import { ExportButton } from "@/components/export/ExportButton";
import { WeekendDetail } from "./WeekendDetail";
import { OutgoingTalksList } from "./OutgoingTalksList";
import { WeekNav, useStoredWeek } from "@/components/shared/WeekNav";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";

interface MeetingRow {
	id: string;
}

export function WeekendList({ tabs }: { tabs: React.ReactNode }) {
	const [weekStart, setWeekStart] = useStoredWeek("weekend");
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [generateError, setGenerateError] = useState(false);

	const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));

	// Cada carga lleva un número: si mientras tanto se pidió otra semana, la respuesta vieja se descarta.
	const loadSeq = useRef(0);
	const load = useCallback(async () => {
		const seq = ++loadSeq.current;
		setLoading(true);
		const response = await fetch(`/api/weekend?from=${weekStart}&to=${weekEnd}`);
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
			<PageHeader
				title="Fin de semana"
				actions={
					<>
						<ExportButton
							kind="weekend-program"
							params={{ date: weekStart }}
							variants={[
								{ label: "Esta semana", params: { scope: "week" } },
								{ label: "Todo el mes", params: { scope: "month" } },
								{ label: "Oradores salientes (semana)", kind: "outgoing-talks", params: { scope: "week" } },
								{ label: "Oradores salientes (mes)", kind: "outgoing-talks", params: { scope: "month" } },
							]}
							label="Descargar reporte"
							title="Reporte de fin de semana"
						/>
						<IconButton label="Agregar las reuniones del mes" icon={Download} tone="accent" disabled={generating} onClick={generateMonth} />
					</>
				}
			/>
			{tabs}
			<WeekNav weekStart={weekStart} onChange={setWeekStart} />
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
