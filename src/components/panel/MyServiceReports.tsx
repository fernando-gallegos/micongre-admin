"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Send } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { S4Form } from "@/components/reports/S4Form";
import { InlineLoader } from "@/components/ui/Spinner";

interface Report {
	participatedInMinistry: boolean;
	isAuxiliaryPioneerThisMonth: boolean;
	hours: number | null;
	projectHours: number | null;
	bibleStudiesCount: number | null;
}

type PioneerType = "auxiliary_pioneer" | "regular_pioneer" | null;

interface MonthEntry {
	year: number;
	month: number;
	label: string;
	report: Report | null;
}

// Mes actual y los 2 anteriores, del más reciente al más antiguo. No se limita al
// año de servicio en curso (empieza en septiembre): en octubre salen octubre,
// septiembre y agosto, para poder enviar también el informe del mes anterior.
function lastThreeMonths(): { year: number; month: number; label: string }[] {
	const now = new Date();
	return [0, 1, 2]
		.map((offset) => new Date(now.getFullYear(), now.getMonth() - offset, 1))
		.map((date) => {
			const label = date.toLocaleDateString("es", { month: "long", year: "numeric" });
			return {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				label: label.charAt(0).toUpperCase() + label.slice(1),
			};
		});
}

export function MyServiceReports({ userId, fullName }: { userId: string; fullName: string }) {
	const [entries, setEntries] = useState<MonthEntry[]>([]);
	const [pioneerType, setPioneerType] = useState<PioneerType>(null);
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		const months = lastThreeMonths();
		const results = await Promise.all(
			months.map(async (m) => {
				const response = await fetch(`/api/reports/s4/mine?year=${m.year}&month=${m.month}`);
				if (!response.ok) return { ...m, report: null, pioneerType: null as PioneerType };
				const body = (await response.json()) as { report: Report | null; pioneerType: PioneerType };
				return { ...m, report: body.report, pioneerType: body.pioneerType };
			}),
		);
		setEntries(results.map(({ pioneerType: _pioneerType, ...entry }) => entry));
		setPioneerType(results[0]?.pioneerType ?? null);
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<section id="mi-informe" className="scroll-mt-6">
			<SectionLabel>Mi informe de servicio</SectionLabel>
			{loading ? (
				<InlineLoader />
			) : (
				<List>
					{entries.map((entry) => {
						const key = `${entry.year}-${entry.month}`;
						const editing = editingKey === key;
						return (
							<div key={key} className="py-3 pl-4 pr-2">
								<div className="flex items-center gap-2">
									<div className="min-w-0 flex-1 py-0.5">
										<p className="text-base font-semibold text-ink">{entry.label}</p>
										{entry.report && !editing && (
											<p className="mt-0.5 text-[13px] text-ink-soft">
												Participó: {entry.report.participatedInMinistry ? "Sí" : "No"} · Horas: {entry.report.hours || "—"}
												{entry.report.projectHours ? ` (+${entry.report.projectHours} proyectos)` : ""} · Cursos:{" "}
												{entry.report.bibleStudiesCount ?? 0}
											</p>
										)}
									</div>
									<Badge tone={entry.report ? "success" : "warning"}>{entry.report ? "Enviado" : "Sin enviar"}</Badge>
									{!editing && (
										<IconButton
											label={entry.report ? "Editar informe" : "Enviar informe"}
											icon={entry.report ? Pencil : Send}
											tone={entry.report ? "plain" : "accent"}
											onClick={() => setEditingKey(key)}
										/>
									)}
								</div>
								{editing && (
									<div className="mt-2 pr-2">
										<S4Form
											userId={userId}
											fullName={fullName}
											periodYear={entry.year}
											periodMonth={entry.month}
											pioneerType={pioneerType}
											initial={entry.report ?? undefined}
											onSaved={() => {
												setEditingKey(null);
												load();
											}}
										/>
									</div>
								)}
							</div>
						);
					})}
				</List>
			)}
		</section>
	);
}
