"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { formatLongDate, formatShortDate } from "@/lib/dateFormat";
import { addDays, mondayOf, toISODate } from "@/lib/mwb/dates";
import { getCurrentServiceYear } from "@/lib/serviceYear";
import { AttendanceForm } from "./AttendanceForm";

interface MeetingRow {
	id: string;
	meetingDate: string;
	meetingType: "midweek" | "weekend";
	inPersonCount: number | null;
	zoomCount: number | null;
}

const MEETING_LABEL = { midweek: "Entre semana", weekend: "Fin de semana" } as const;
const keyOf = (m: MeetingRow) => `${m.meetingType}-${m.id}`;

export function AttendanceList() {
	const [rows, setRows] = useState<MeetingRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	useEffect(() => {
		async function load() {
			// Todo el año de servicio en curso (septiembre a agosto): las reuniones que existan y la asistencia ya registrada, en una sola
			// consulta de asistencia (antes se pedía una por reunión y solo se veía el mes actual).
			const from = `${getCurrentServiceYear()}-09-01`;
			const [midweekRes, weekendRes, attendanceRes] = await Promise.all([
				fetch(`/api/midweek?from=${from}`),
				fetch(`/api/weekend?from=${from}`),
				fetch(`/api/attendance?from=${from}`),
			]);
			const merged: MeetingRow[] = [];
			if (midweekRes.ok) {
				const body = (await midweekRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ ...m, meetingType: "midweek" as const, inPersonCount: null, zoomCount: null })));
			}
			if (weekendRes.ok) {
				const body = (await weekendRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ ...m, meetingType: "weekend" as const, inPersonCount: null, zoomCount: null })));
			}
			// Solo hasta la semana actual (la reunión de esta semana se puede registrar aunque falte unas horas); las futuras todavía no
			// han pasado. Domingo de esta semana con la fecha local (no UTC).
			const now = new Date();
			const localToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
			const weekEnd = toISODate(addDays(mondayOf(localToday), 6));
			const held = merged.filter((m) => m.meetingDate <= weekEnd);
			merged.length = 0;
			merged.push(...held);
			merged.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));

			const counts = new Map<string, { inPersonCount: number; zoomCount: number }>();
			if (attendanceRes.ok) {
				const body = (await attendanceRes.json()) as {
					items: { meetingType: string; meetingId: string; inPersonCount: number; zoomCount: number }[];
				};
				for (const a of body.items) counts.set(`${a.meetingType}-${a.meetingId}`, { inPersonCount: a.inPersonCount, zoomCount: a.zoomCount });
			}
			const withAttendance = merged.map((m) => ({ ...m, ...(counts.get(keyOf(m)) ?? {}) }));

			setRows(withAttendance);
			// La reunión a registrar: la más reciente ya realizada que aún no tiene cifras
			// (si todas las tienen, la más reciente realizada; si ninguna ha pasado, la primera).
			const today = new Date().toISOString().slice(0, 10);
			const past = withAttendance.filter((m) => m.meetingDate <= today);
			const pending = [...past].reverse().find((m) => m.inPersonCount === null);
			const pick = pending ?? past.at(-1) ?? withAttendance[0];
			setSelectedKey(pick ? keyOf(pick) : null);
			setLoading(false);
		}
		load();
	}, []);

	const selected = rows.find((m) => keyOf(m) === selectedKey) ?? null;
	// Lo más reciente primero, como lista de consulta.
	const listed = [...rows].reverse();

	return (
		<div className="flex flex-col gap-5">
			<div className="-ml-2 flex items-center gap-1">
				<IconButton label="Volver a informes" icon={ArrowLeft} href="/reports" />
				<h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">Asistencia</h1>
			</div>

			{!loading && rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">Todavía no hay reuniones realizadas en este año de servicio.</p>
				</Card>
			)}

			{selected && (
				<Card className="mx-auto flex w-full max-w-md flex-col items-center gap-5 py-6">
					<p className="text-[13px] text-ink-soft">
						{MEETING_LABEL[selected.meetingType]} · {formatLongDate(selected.meetingDate)}
					</p>
					<AttendanceForm
						key={keyOf(selected)}
						meetingType={selected.meetingType}
						meetingId={selected.id}
						meetingDate={selected.meetingDate}
						initialInPerson={selected.inPersonCount}
						initialZoom={selected.zoomCount}
						onSaved={(counts) =>
							setRows((all) => all.map((m) => (keyOf(m) === keyOf(selected) ? { ...m, ...counts } : m)))
						}
					/>
				</Card>
			)}

			{rows.length > 0 && (
				<section>
					<SectionLabel>{`Año de servicio ${getCurrentServiceYear()}–${getCurrentServiceYear() + 1}`}</SectionLabel>
					<List>
						{listed.map((m) => {
							const active = keyOf(m) === selectedKey;
							return (
								<button
									key={keyOf(m)}
									type="button"
									onClick={() => setSelectedKey(keyOf(m))}
									aria-current={active}
									className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
										active ? "bg-accent-soft" : "hover:bg-surface-alt"
									}`}
								>
									<div className="min-w-0 flex-1">
										<div className="text-base font-semibold text-ink">
											{MEETING_LABEL[m.meetingType]} · {formatShortDate(m.meetingDate)}
										</div>
										{m.zoomCount ? <div className="mt-0.5 text-[13px] text-ink-soft">{m.zoomCount} por Zoom</div> : null}
									</div>
									<span className={`font-display text-[22px] font-semibold ${m.inPersonCount === null ? "text-ink-soft" : "text-ink"}`}>
										{m.inPersonCount ?? "—"}
									</span>
								</button>
							);
						})}
					</List>
				</section>
			)}
		</div>
	);
}
