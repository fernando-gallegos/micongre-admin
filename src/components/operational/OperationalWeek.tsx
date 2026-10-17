"use client";

import { useEffect, useState } from "react";
import { ExportButton } from "@/components/export/ExportButton";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionLabel, Segmented } from "@/components/ui/Layout";
import { WeekNav, useStoredWeek } from "@/components/shared/WeekNav";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";
import { WeeklyMatrix } from "./WeeklyMatrix";

const TABS: { value: "midweek" | "weekend"; label: string }[] = [
	{ value: "midweek", label: "Entre semana" },
	{ value: "weekend", label: "Fin de semana" },
];

// "mar 6 oct"
function shortDateEs(iso: string): string {
	return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
		.format(new Date(`${iso}T00:00:00Z`))
		.replace(/\./g, "")
		.replace(",", "");
}

interface MeetingRow {
	id: string;
	meetingDate: string;
	meetingType: "midweek" | "weekend";
}

export function OperationalWeek() {
	const [weekStart, setWeekStart] = useStoredWeek("operational");
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [tab, setTab] = useState<"midweek" | "weekend">("midweek");

	useEffect(() => {
		async function load() {
			setLoading(true);
			const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), 6));
			const range = `from=${weekStart}&to=${weekEnd}`;
			const [midweekRes, weekendRes] = await Promise.all([
				fetch(`/api/midweek?${range}`),
				fetch(`/api/weekend?${range}`),
			]);
			const merged: MeetingRow[] = [];
			if (midweekRes.ok) {
				const body = (await midweekRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ id: m.id, meetingDate: m.meetingDate, meetingType: "midweek" as const })));
			}
			if (weekendRes.ok) {
				const body = (await weekendRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ id: m.id, meetingDate: m.meetingDate, meetingType: "weekend" as const })));
			}
			merged.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
			setRows(merged);
			setLoading(false);
		}
		load();
	}, [weekStart]);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Tareas operativas"
				actions={
					<ExportButton
						kind="operational"
						params={{ date: weekStart }}
						variants={[
							{ label: "Esta semana", params: { scope: "week" } },
							{ label: "Todo el mes", params: { scope: "month" } },
						]}
						label="Descargar reporte de tareas operativas"
					/>
				}
			/>

			<WeekNav weekStart={weekStart} onChange={setWeekStart} />

			<Segmented value={tab} onChange={setTab} options={TABS} label="Reunión" />

			{/* Ambas matrices quedan montadas para no perder lo que se haya elegido sin guardar al cambiar de pestaña. */}
			{!loading &&
				TABS.map((t) => {
					const row = rows.find((r) => r.meetingType === t.value);
					return (
						<div key={t.value} hidden={tab !== t.value} className={tab !== t.value ? "hidden" : "flex flex-col gap-2"}>
							{row && <SectionLabel>{`${t.label} · ${shortDateEs(row.meetingDate)}`}</SectionLabel>}
							{row ? (
								<WeeklyMatrix key={row.id} meetingType={t.value} meetingId={row.id} />
							) : (
								<Card>
									<p className="text-sm text-ink-soft">No hay reunión programada para esta semana.</p>
								</Card>
							)}
						</div>
					);
				})}
		</div>
	);
}
