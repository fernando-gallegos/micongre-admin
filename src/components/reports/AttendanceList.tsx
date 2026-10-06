"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { formatLongDate, formatShortDate } from "@/lib/dateFormat";
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
			const [midweekRes, weekendRes] = await Promise.all([fetch("/api/midweek"), fetch("/api/weekend")]);
			const merged: MeetingRow[] = [];
			if (midweekRes.ok) {
				const body = (await midweekRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ ...m, meetingType: "midweek" as const, inPersonCount: null, zoomCount: null })));
			}
			if (weekendRes.ok) {
				const body = (await weekendRes.json()) as { items: { id: string; meetingDate: string }[] };
				merged.push(...body.items.map((m) => ({ ...m, meetingType: "weekend" as const, inPersonCount: null, zoomCount: null })));
			}
			merged.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));

			const withAttendance = await Promise.all(
				merged.map(async (m) => {
					const res = await fetch(`/api/attendance?meetingType=${m.meetingType}&meetingId=${m.id}`);
					if (!res.ok) return m;
					const body = (await res.json()) as { item: { inPersonCount: number; zoomCount: number } | null };
					return body.item
						? { ...m, inPersonCount: body.item.inPersonCount, zoomCount: body.item.zoomCount }
						: m;
				}),
			);

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
					<p className="text-sm text-ink-soft">No hay reuniones programadas este mes.</p>
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
					<SectionLabel>Reuniones</SectionLabel>
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
