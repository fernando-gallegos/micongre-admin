"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { clampProjectHours, maxProjectHours } from "@/lib/reports/projectHours";
import { Tooltip } from "@/components/ui/Tooltip";

export interface S21EditorRow {
	month: number;
	calendarYear: number;
	label: string;
	// El mes todavía no llega: no se puede reportar.
	future: boolean;
	report: {
		participatedInMinistry: boolean;
		isAuxiliaryPioneerThisMonth: boolean;
		hours: number | null;
		projectHours: number | null;
		bibleStudiesCount: number | null;
		comments: string | null;
		creditHoursNote: string | null;
	} | null;
}

interface RowValues {
	participated: boolean;
	studies: string;
	aux: boolean;
	hours: string;
	projectHours: string;
	notes: string;
}

type RowStatus = "idle" | "saving" | "saved" | "error";

function toValues(report: S21EditorRow["report"]): RowValues {
	return {
		participated: report?.participatedInMinistry ?? false,
		studies: report?.bibleStudiesCount ? String(report.bibleStudiesCount) : "",
		aux: report?.isAuxiliaryPioneerThisMonth ?? false,
		hours: report?.hours ? String(report.hours) : "",
		projectHours: report?.projectHours ? String(report.projectHours) : "",
		notes: report?.comments ?? "",
	};
}

function sameValues(a: RowValues, b: RowValues) {
	return (
		a.participated === b.participated &&
		a.studies === b.studies &&
		a.aux === b.aux &&
		a.hours === b.hours &&
		a.projectHours === b.projectHours &&
		a.notes === b.notes
	);
}

function isEmpty(v: RowValues) {
	return !v.participated && !v.studies && !v.aux && !v.hours && !v.projectHours && !v.notes.trim();
}

function patch<T>(list: T[], i: number, value: T): T[] {
	return list.map((x, idx) => (idx === i ? value : x));
}

const CELL = "border border-gray-800 px-2 py-1";
const INPUT =
	"w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-center text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-gray-100 disabled:text-gray-400";

// Modo edición de la S-21: la misma tabla, pero cada mes es una línea que se
// edita y se guarda por separado (alta retroactiva de informes, sin ir mes por
// mes por otra pantalla).
export function S21Editor({
	userId,
	rows,
	pioneerCapable,
}: {
	userId: string;
	rows: S21EditorRow[];
	// Tiene (o tuvo) nombramiento de precursor regular: entonces reporta horas todos los meses.
	pioneerCapable: boolean;
}) {
	const router = useRouter();
	const [saved, setSaved] = useState<RowValues[]>(() => rows.map((r) => toValues(r.report)));
	const [draft, setDraft] = useState<RowValues[]>(() => rows.map((r) => toValues(r.report)));
	const [exists, setExists] = useState<boolean[]>(() => rows.map((r) => r.report !== null));
	const [status, setStatus] = useState<RowStatus[]>(() => rows.map(() => "idle"));
	const [errors, setErrors] = useState<(string | null)[]>(() => rows.map(() => null));

	function change(i: number, next: Partial<RowValues>) {
		setDraft((d) => {
			const merged = { ...d[i], ...next };
			// Horas o cursos implican que participó.
			if ((next.hours !== undefined || next.studies !== undefined) && (merged.hours || merged.studies)) {
				merged.participated = true;
			}
			// Horas de proyectos: nunca más que 55 − horas de servicio (vacío si ya no hay cupo).
			if (merged.projectHours !== "") {
				const clamped = clampProjectHours(
					Number(merged.hours.replace(",", ".")) || 0,
					Number(merged.projectHours.replace(",", ".")) || 0,
				);
				if (String(clamped ?? "") !== merged.projectHours) merged.projectHours = clamped?.toString() ?? "";
			}
			return patch(d, i, merged);
		});
		setStatus((s) => patch(s, i, "idle"));
		setErrors((e) => patch(e, i, null));
	}

	async function save(i: number) {
		const row = rows[i];
		const v = draft[i];
		const hours = v.hours.trim() === "" ? null : Number(v.hours.replace(",", "."));
		const projectHours = v.projectHours.trim() === "" ? null : Number(v.projectHours.replace(",", "."));
		const studies = v.studies.trim() === "" ? 0 : Number(v.studies);
		if (
			(hours !== null && (!Number.isFinite(hours) || hours < 0)) ||
			(projectHours !== null && (!Number.isFinite(projectHours) || projectHours < 0)) ||
			!Number.isInteger(studies) ||
			studies < 0
		) {
			setStatus((s) => patch(s, i, "error"));
			setErrors((e) => patch(e, i, "Revisa las horas y los cursos."));
			return;
		}

		setStatus((s) => patch(s, i, "saving"));
		const response = await fetch(`/api/reports/s21/${userId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				periodYear: row.calendarYear,
				periodMonth: row.month,
				participatedInMinistry: v.participated,
				isAuxiliaryPioneerThisMonth: v.aux,
				hours,
				projectHours,
				bibleStudiesCount: studies,
				comments: v.notes.trim() || null,
			}),
		});
		if (!response.ok) {
			setStatus((s) => patch(s, i, "error"));
			setErrors((e) => patch(e, i, "No se pudo guardar."));
			return;
		}
		// Lo guardado puede diferir de lo escrito (participó se deduce de horas/cursos).
		const normalized: RowValues = { ...v, participated: v.participated || studies > 0 || (hours ?? 0) > 0 };
		setDraft((d) => patch(d, i, normalized));
		setSaved((s) => patch(s, i, normalized));
		setExists((x) => patch(x, i, true));
		setStatus((s) => patch(s, i, "saved"));
		router.refresh();
	}

	async function remove(i: number) {
		const row = rows[i];
		if (!window.confirm(`¿Quitar el informe de ${row.label}?`)) return;
		setStatus((s) => patch(s, i, "saving"));
		const response = await fetch(`/api/reports/s21/${userId}?year=${row.calendarYear}&month=${row.month}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			setStatus((s) => patch(s, i, "error"));
			setErrors((e) => patch(e, i, "No se pudo quitar."));
			return;
		}
		const empty = toValues(null);
		setDraft((d) => patch(d, i, empty));
		setSaved((s) => patch(s, i, empty));
		setExists((x) => patch(x, i, false));
		setStatus((s) => patch(s, i, "idle"));
		router.refresh();
	}

	const totalProjectHours = saved.reduce((sum, v) => sum + (Number(v.projectHours.replace(",", ".")) || 0), 0);
	const totalHours = saved.reduce((sum, v) => sum + (Number(v.hours.replace(",", ".")) || 0), 0);

	return (
		<table className="mt-2 w-full border-collapse border border-gray-800 text-center">
			<thead>
				<tr className="bg-gray-100">
					<th className={`${CELL} text-left`}>Mes</th>
					<th className={CELL}>
						Participación
						<br />
						en el ministerio
					</th>
					<th className={CELL}>
						Cursos
						<br />
						bíblicos
					</th>
					<th className={CELL}>
						Precursor
						<br />
						auxiliar
					</th>
					<th className={CELL}>Horas</th>
					{pioneerCapable && (
						<th className={CELL}>
							Horas de
							<br />
							proyectos
						</th>
					)}
					<th className={`${CELL} text-left`}>Notas</th>
					<th className={`${CELL} w-24`}>
						<span className="sr-only">Acciones</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row, i) => {
					const v = draft[i];
					const dirty = !sameValues(v, saved[i]);
					const busy = status[i] === "saving";
					const hoursEnabled = pioneerCapable || v.aux || v.hours !== "";
					const canSave = dirty && !busy && !(isEmpty(v) && !exists[i]);
					return (
						<tr
							key={row.month}
							className={row.future ? "opacity-50" : dirty ? "bg-amber-50" : undefined}
							onKeyDown={(e) => {
								if (e.key === "Enter" && canSave && e.target instanceof HTMLInputElement && e.target.type !== "checkbox") {
									e.preventDefault();
									void save(i);
								}
							}}
						>
							<td className={`${CELL} text-left`}>{row.label}</td>
							<td className={CELL}>
								<input
									type="checkbox"
									aria-label={`Participó en ${row.label}`}
									checked={v.participated}
									disabled={row.future || busy}
									onChange={(e) => change(i, { participated: e.target.checked })}
								/>
							</td>
							<td className={CELL}>
								<input
									type="number"
									min={0}
									inputMode="numeric"
									aria-label={`Cursos bíblicos de ${row.label}`}
									className={`${INPUT} w-16`}
									value={v.studies}
									disabled={row.future || busy}
									onChange={(e) => change(i, { studies: e.target.value })}
								/>
							</td>
							<td className={CELL}>
								<input
									type="checkbox"
									aria-label={`Precursor auxiliar en ${row.label}`}
									checked={v.aux}
									disabled={row.future || busy}
									onChange={(e) => change(i, { aux: e.target.checked, participated: e.target.checked || v.participated })}
								/>
							</td>
							<td className={CELL}>
								<input
									inputMode="decimal"
									aria-label={`Horas de ${row.label}`}
									className={`${INPUT} w-20`}
									value={v.hours}
									disabled={row.future || busy || !hoursEnabled}
									onChange={(e) => change(i, { hours: e.target.value })}
								/>
							</td>
							{pioneerCapable && (
								<td className={CELL}>
									<Tooltip content={`Máximo: ${Math.max(0, maxProjectHours(Number(v.hours.replace(",", ".")) || 0))}`}>
										<input
											inputMode="decimal"
											aria-label={`Horas de proyectos de ${row.label}`}
											className={`${INPUT} w-20`}
											value={v.projectHours}
											disabled={row.future || busy || v.aux || maxProjectHours(Number(v.hours.replace(",", ".")) || 0) <= 0}
											onChange={(e) => change(i, { projectHours: e.target.value })}
										/>
									</Tooltip>
								</td>
							)}
							<td className={`${CELL} text-left`}>
								<input
									aria-label={`Notas de ${row.label}`}
									className={`${INPUT} text-left`}
									value={v.notes}
									maxLength={500}
									disabled={row.future || busy}
									onChange={(e) => change(i, { notes: e.target.value })}
								/>
								{row.report?.creditHoursNote && (
									<span className="mt-0.5 block text-left text-xs text-gray-500">{row.report.creditHoursNote}</span>
								)}
								{errors[i] && <span className="mt-0.5 block text-left text-xs text-red-600">{errors[i]}</span>}
							</td>
							<td className={CELL}>
								<div className="flex items-center justify-center gap-1">
									{busy ? (
										<Loader2 size={16} className="animate-spin text-gray-500" />
									) : (
										<>
											<Tooltip content={`Guardar ${row.label}`}>
												<button
													type="button"
													onClick={() => save(i)}
													disabled={!canSave}
													aria-label={`Guardar ${row.label}`}
													className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-transparent disabled:text-transparent"
												>
													<Check size={15} />
												</button>
											</Tooltip>
											{status[i] === "saved" && !dirty && <span className="text-xs text-accent">Guardado</span>}
											{exists[i] && !dirty && status[i] !== "saved" && (
												<Tooltip content={`Quitar informe de ${row.label}`}>
													<button
														type="button"
														onClick={() => remove(i)}
														aria-label={`Quitar informe de ${row.label}`}
														className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600"
													>
														<Trash2 size={14} />
													</button>
												</Tooltip>
											)}
										</>
									)}
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
			<tfoot>
				<tr className="bg-gray-100 font-semibold">
					<td className={`${CELL} text-left`} colSpan={4}>
						Total
					</td>
					<td className={CELL}>{totalHours || ""}</td>
					{pioneerCapable && <td className={CELL}>{totalProjectHours || ""}</td>}
					<td className={CELL} colSpan={2}></td>
				</tr>
			</tfoot>
		</table>
	);
}
