"use client";

import { useEffect, useRef, useState } from "react";
import { ExportElementButton } from "@/components/export/ExportButton";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { CLEANING_KIND_FREQUENCY, CLEANING_KIND_HINT, CLEANING_KIND_LABEL, type CleaningKind } from "@/lib/cleaning/labels";
import type { ScheduleCell, ScheduleModel } from "@/lib/cleaning/schedule";
import { PageLoader } from "@/components/ui/Spinner";

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

// Colores de cada tipo en el cronograma oficial.
const KIND_COLOR: Record<CleaningKind, string> = { ligera: "#14608f", profunda: "#9a3262", a_fondo: "#33837f" };

const TH = "border border-gray-400 px-1 py-0.5 text-center text-[9px] font-normal uppercase text-gray-800";
const TD = "h-[22px] border border-gray-400 px-0.5 text-center align-middle text-[7px] leading-tight text-gray-900";

function Cell({ cell, blank }: { cell: ScheduleCell | null; blank: boolean }) {
	if (blank || !cell) return <td className={TD} />;
	return (
		<td className={TD}>
			{cell.completed && <span className="mr-0.5 text-[10px] font-bold">✓</span>}
			{cell.names.join(" + ")}
		</td>
	);
}

function SectionHeader({ kind }: { kind: CleaningKind }) {
	return (
		<div className="flex items-center justify-between gap-6 px-3 py-1.5 text-white" style={{ backgroundColor: KIND_COLOR[kind] }}>
			<div>
				<p className="text-lg font-bold uppercase leading-tight">{CLEANING_KIND_LABEL[kind]}</p>
				<p className="text-xs uppercase leading-tight">{CLEANING_KIND_FREQUENCY[kind]}</p>
			</div>
			<p className="max-w-[55%] text-[9px] leading-tight">
				Revisar la Guía para la limpieza del Salón del Reino - {CLEANING_KIND_LABEL[kind]}.
				<br />
				Sugerencia: {CLEANING_KIND_HINT[kind]}
			</p>
		</div>
	);
}

// Cronograma de limpieza del Salón del Reino de un año, con la misma
// estructura que el formulario oficial (limpieza ligera / profunda / a fondo,
// por mes y semana). "En blanco" lo deja sin asignaciones para llenarlo a mano.
export function CleaningSchedule() {
	const [year, setYear] = useState(() => new Date().getFullYear());
	const [blank, setBlank] = useState(false);
	const [data, setData] = useState<{ congregationName: string; schedule: ScheduleModel } | null>(null);
	const [error, setError] = useState(false);
	const sheetRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setError(false);
			const response = await fetch(`/api/cleaning/schedule?year=${year}`);
			if (cancelled) return;
			if (response.ok) setData((await response.json()) as { congregationName: string; schedule: ScheduleModel });
			else setError(true);
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [year]);

	const schedule = data?.schedule.year === year ? data.schedule : null;

	return (
		<div className="flex flex-col gap-4">
			<style>{"@media print { @page { size: landscape; margin: 8mm; } html, body { background: #fff !important; } }"}</style>

			<div className="flex flex-col gap-4 print:hidden">
				<div className="-ml-2 flex items-center gap-1">
					<IconButton label="Volver a limpieza" icon={ArrowLeft} href="/cleaning" />
					<h1 className="font-display text-2xl font-medium text-ink">Cronograma de limpieza</h1>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center rounded-full bg-surface p-1">
						<IconButton label="Año anterior" icon={ChevronLeft} onClick={() => setYear((y) => y - 1)} />
						<span className="min-w-[4rem] text-center text-[15px] font-semibold text-ink">{year}</span>
						<IconButton label="Año siguiente" icon={ChevronRight} onClick={() => setYear((y) => y + 1)} />
					</div>
					<label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
						<input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
						En blanco (sin asignaciones)
					</label>
					<div className="flex items-center gap-1 sm:ml-auto">
						{schedule && <ExportElementButton getElement={() => sheetRef.current} fileName={`cronograma-limpieza-${year}`} />}
						<Button onClick={() => window.print()} disabled={!schedule}>
							<Printer size={16} />
							Imprimir
						</Button>
					</div>
				</div>
			</div>

			{error && <p className="text-sm text-warn">No se pudo cargar el cronograma.</p>}
			{!schedule && !error && <PageLoader />}

			{schedule && (
				<div ref={sheetRef} className="overflow-x-auto rounded-[20px] bg-white p-4 text-gray-900 print:overflow-visible print:rounded-none print:p-0">
					<div className="min-w-[960px]">
						<h1 className="text-2xl font-extrabold uppercase leading-tight">
							Cronograma de limpieza
							<br />
							del Salón del Reino {schedule.year}
						</h1>
						<p className="mt-1 text-xs uppercase">Para uso de cada congregación</p>
						<p className="mt-2 text-xs">
							<span className="font-bold">CONGREGACIÓN:</span> {data?.congregationName || "________________"}
						</p>
						<p className="mb-2 text-[9px]">
							El coordinador de limpieza puede marcar el recuadro correspondiente cada vez que se realice la limpieza del
							Salón del Reino.
							{!blank && " ✓ = realizada · ES = reunión entre semana · FS = reunión de fin de semana."}
						</p>

						<section className="mb-3">
							<SectionHeader kind="ligera" />
							<table className="w-full table-fixed border-collapse">
								<thead>
									<tr>
										<th className={`${TH} w-10`} rowSpan={2}>
											Semana
										</th>
										{MONTHS.map((m) => (
											<th key={m} className={TH} colSpan={2}>
												{m}
											</th>
										))}
									</tr>
									<tr>
										{MONTHS.flatMap((m) => [
											<th key={`${m}-es`} className={`${TH} text-[7px]`}>
												ES
											</th>,
											<th key={`${m}-fs`} className={`${TH} text-[7px]`}>
												FS
											</th>,
										])}
									</tr>
								</thead>
								<tbody>
									{[0, 1, 2, 3, 4].map((week) => (
										<tr key={week}>
											<td className={TD}>{week + 1}</td>
											{schedule.ligera.flatMap((month, m) => [
												<Cell key={`${m}-es`} cell={month[week]?.midweek ?? null} blank={blank} />,
												<Cell key={`${m}-fs`} cell={month[week]?.weekend ?? null} blank={blank} />,
											])}
										</tr>
									))}
								</tbody>
							</table>
						</section>

						<section className="mb-3">
							<SectionHeader kind="profunda" />
							<table className="w-full table-fixed border-collapse">
								<thead>
									<tr>
										<th className={`${TH} w-10`}>Semana</th>
										{MONTHS.map((m) => (
											<th key={m} className={TH}>
												{m}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{[0, 1, 2, 3, 4].map((week) => (
										<tr key={week}>
											<td className={TD}>{week + 1}</td>
											{schedule.profunda.map((month, m) => (
												<Cell key={m} cell={month[week] ?? null} blank={blank} />
											))}
										</tr>
									))}
								</tbody>
							</table>
						</section>

						<section>
							<SectionHeader kind="a_fondo" />
							<table className="w-full table-fixed border-collapse">
								<thead>
									<tr>
										<th className={`${TH} w-10`}>Mes</th>
										{MONTHS.map((m) => (
											<th key={m} className={TH}>
												{m}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									<tr>
										<td className={`${TD} h-[34px]`}>Fecha</td>
										{schedule.aFondo.map((entries, m) => (
											<td key={m} className={`${TD} h-[34px]`}>
												{!blank &&
													entries.map((entry) => (
														<div key={entry.date + entry.names.join()}>
															{entry.completed && <span className="mr-0.5 text-[10px] font-bold">✓</span>}
															<span className="font-bold">{Number(entry.date.slice(8, 10))}</span>
															{entry.names.length > 0 && <span> {entry.names.join(" + ")}</span>}
														</div>
													))}
											</td>
										))}
									</tr>
								</tbody>
							</table>
						</section>
					</div>
				</div>
			)}
		</div>
	);
}
