"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, HeartHandshake, Pencil } from "lucide-react";
import { ExportButton } from "@/components/export/ExportButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup, IconButton, List, ListRow } from "@/components/ui/Layout";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { S4Form } from "./S4Form";

interface Row {
	userId: string;
	fullName: string;
	reportId: string | null;
	participatedInMinistry: boolean | null;
	isAuxiliaryPioneerThisMonth: boolean | null;
	hours: number | null;
	projectHours: number | null;
	bibleStudiesCount: number | null;
	status: string | null;
	comments: string | null;
	pioneerType: "auxiliary_pioneer" | "regular_pioneer" | null;
}

const MONTH_NAMES = [
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const now = new Date();

type Filter = "all" | "missing" | "delivered";

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "Todos" },
	{ value: "missing", label: "Faltan" },
	{ value: "delivered", label: "Entregados" },
];

/** Línea de detalle de la fila: precursorado, horas, cursos y si no participó. */
function detailOf(row: Row): string {
	const parts: string[] = [];
	if (row.pioneerType) parts.push(row.pioneerType === "regular_pioneer" ? "precursor regular" : "precursor auxiliar");
	if (row.reportId) {
		if (!row.participatedInMinistry) parts.push("no participó");
		if (row.hours) parts.push(`${row.hours} h${row.projectHours ? ` (+${row.projectHours})` : ""}`);
		if (row.bibleStudiesCount) parts.push(`${row.bibleStudiesCount} ${row.bibleStudiesCount === 1 ? "curso" : "cursos"}`);
	}
	return parts.join(" · ");
}

export function S4CollectionTable() {
	const [year, setYear] = useState(now.getFullYear());
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [rows, setRows] = useState<Row[]>([]);
	const [filter, setFilter] = useState<Filter>("all");
	const [loading, setLoading] = useState(true);
	const [forbidden, setForbidden] = useState(false);
	const [editingRow, setEditingRow] = useState<Row | null>(null);
	const [flaggingRow, setFlaggingRow] = useState<Row | null>(null);
	const [flagReason, setFlagReason] = useState("");
	const [flagSaving, setFlagSaving] = useState(false);
	const [flagError, setFlagError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setForbidden(false);
		const response = await fetch(`/api/reports/s4?year=${year}&month=${month}`);
		if (response.status === 403) {
			setForbidden(true);
			setRows([]);
		} else if (response.ok) {
			const body = (await response.json()) as { items: Row[] };
			setRows(body.items);
		}
		setLoading(false);
	}, [year, month]);

	useEffect(() => {
		load();
	}, [load]);

	function openFlag(row: Row) {
		setFlaggingRow(row);
		setFlagReason("");
		setFlagError(null);
	}

	async function handleSaveFlag() {
		if (!flaggingRow) return;
		setFlagSaving(true);
		setFlagError(null);
		const response = await fetch("/api/pastoral/flags", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ publisherId: flaggingRow.userId, reason: flagReason }),
		});
		setFlagSaving(false);
		if (!response.ok) {
			setFlagError("No se pudo marcar. Intenta de nuevo.");
			return;
		}
		setFlaggingRow(null);
	}

	const visibleRows = rows.filter((r) => filter === "all" || (filter === "missing" ? !r.reportId : !!r.reportId));

	function shiftMonth(delta: number) {
		const d = new Date(year, month - 1 + delta, 1);
		setYear(d.getFullYear());
		setMonth(d.getMonth() + 1);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex h-12 items-center justify-between rounded-full bg-surface px-1">
				<IconButton label="Mes anterior" icon={ChevronLeft} onClick={() => shiftMonth(-1)} />
				<span className="text-[15px] font-semibold text-ink">
					{MONTH_NAMES[month - 1]} {year}
				</span>
				<div className="flex items-center">
					{!forbidden && (
						<ExportButton
							kind="reports-month"
							params={{ month: `${year}-${String(month).padStart(2, "0")}` }}
							formats={["xlsx", "docx", "png"]}
							label="Descargar informes del mes"
							title="Descargar informes del mes"
						/>
					)}
					<IconButton label="Mes siguiente" icon={ChevronRight} onClick={() => shiftMonth(1)} />
				</div>
			</div>

			{!forbidden && (
				<ChipGroup>
					{FILTERS.map((f) => (
						<Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
							{f.label}
						</Chip>
					))}
				</ChipGroup>
			)}

			{forbidden && (
				<Card>
					<p className="text-sm text-ink-soft">
						No supervisas ningún grupo de servicio, así que no tienes informes que revisar aquí. Puedes
						enviar el tuyo propio desde Mi panel.
					</p>
				</Card>
			)}

			{!loading && !forbidden && rows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">No hay publicadores en tu alcance.</p>
				</Card>
			)}

			{!forbidden && rows.length > 0 && visibleRows.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">Nadie coincide con el filtro.</p>
				</Card>
			)}

			{!forbidden && visibleRows.length > 0 && (
				<List>
					{visibleRows.map((row) => (
						<ListRow
							key={row.userId}
							title={row.fullName}
							subtitle={detailOf(row) || undefined}
							trailing={
								<div className="-mr-3 flex shrink-0 items-center">
									<span className={`mr-1 text-xs font-semibold ${row.reportId ? "text-accent" : "text-warn"}`}>
										{row.reportId ? "Entregado" : "Falta"}
									</span>
									<IconButton
										label={row.reportId ? "Editar informe" : "Completar informe"}
										icon={Pencil}
										tone={row.reportId ? "plain" : "accent"}
										onClick={() => setEditingRow(row)}
									/>
									<IconButton label="Marcar para pastoreo" icon={HeartHandshake} onClick={() => openFlag(row)} />
								</div>
							}
						/>
					))}
				</List>
			)}

			<Modal open={!!editingRow} onClose={() => setEditingRow(null)} title="Informe mensual (S-4)">
				{editingRow && (
					<S4Form
						userId={editingRow.userId}
						fullName={editingRow.fullName}
						periodYear={year}
						periodMonth={month}
						pioneerType={editingRow.pioneerType}
						initial={
							editingRow.reportId
								? {
										participatedInMinistry: editingRow.participatedInMinistry ?? true,
										isAuxiliaryPioneerThisMonth: editingRow.isAuxiliaryPioneerThisMonth ?? false,
										hours: editingRow.hours,
										projectHours: editingRow.projectHours,
										comments: editingRow.comments,
										bibleStudiesCount: editingRow.bibleStudiesCount,
									}
								: undefined
						}
						onSaved={() => {
							setEditingRow(null);
							load();
						}}
					/>
				)}
			</Modal>

			<Modal open={!!flaggingRow} onClose={() => setFlaggingRow(null)} title="Marcar para pastoreo">
				<div className="flex flex-col gap-3">
					<p className="text-sm text-ink-soft">
						Avisa al cuerpo de ancianos sobre {flaggingRow?.fullName} (luto, dificultad familiar aguda, sfg 2:4).
					</p>
					<Input
						label="Motivo"
						value={flagReason}
						onChange={(e) => setFlagReason(e.target.value)}
						placeholder="Breve descripción"
					/>
					{flagError && <p className="text-sm text-warn">{flagError}</p>}
					<Button onClick={handleSaveFlag} disabled={flagSaving || !flagReason}>
						{flagSaving ? "Guardando..." : "Marcar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
