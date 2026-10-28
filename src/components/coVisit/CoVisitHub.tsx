"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Fab, IconButton, List, ListRow, PageHeader, Segmented, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { SelectAllControls } from "@/components/shared/SelectAllControls";
import { RecommendationsDecisionPanel } from "@/components/coVisit/RecommendationsDecisionPanel";
import { formatShortDate } from "@/lib/dateFormat";

const OFFICE_LABELS: Record<string, string> = { ELDER: "Anciano", MINISTERIAL_SERVANT: "Siervo ministerial" };

const QUALIFICATION_LABELS: Record<string, string> = {
	husbandOfOneWife: "Esposo de una sola esposa",
	managesHouseholdWell: "Dirige bien su casa",
	notARecentConvert: "No es convertido reciente",
	goodReputationOutsideCongregation: "Buena reputación fuera de la congregación",
	temperateAndSoundInMind: "Templado y de mente sana",
	orderlyAndHospitable: "Ordenado y hospitalario",
	notViolentButReasonable: "No violento, razonable",
	notAddictedToWineNotPugnacious: "No dado a mucho vino, no pendenciero",
	notLoverOfMoney: "No amante del dinero",
	skillfulTeacher: "Hábil para enseñar",
};

interface Visit {
	id: string;
	circuitOverseerName: string;
	startDate: string;
	endDate: string;
	midweekMeetingModifications: boolean;
	notes: string | null;
	hospitalitySchedule: Record<string, { lunch?: string | null; dinner?: string | null }> | null;
}

interface HospitalityRow {
	date: string;
	lunch: string;
	dinner: string;
}

interface PublisherOption {
	id: string;
	fullName: string;
	gender: "male" | "female";
	appointments: { appointmentType: string; endDate: string | null }[];
}

const EMPTY_VISIT_FORM = {
	circuitOverseerName: "",
	startDate: "",
	endDate: "",
	midweekMeetingModifications: false,
};

const EMPTY_RECOMMENDATION_FORM = {
	candidateUserId: "",
	recommendedOffice: "ELDER",
	isFirstTime: true,
	isReappointment: false,
	removalDate: "",
	removalReason: "",
	previousCongregationLetterAttached: false,
	threeMandatoryQuestionsConfirmed: false,
};

export function CoVisitHub() {
	const [visits, setVisits] = useState<Visit[]>([]);
	const [publishers, setPublishers] = useState<PublisherOption[]>([]);
	const [tab, setTab] = useState<"agenda" | "pioneers" | "s62">("agenda");
	const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
	const [auxPioneerIds, setAuxPioneerIds] = useState<Set<string>>(new Set());
	const [savingAuxPioneers, setSavingAuxPioneers] = useState(false);
	const [auxPioneersError, setAuxPioneersError] = useState<string | null>(null);

	const [visitModalOpen, setVisitModalOpen] = useState(false);
	const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
	const [visitForm, setVisitForm] = useState(EMPTY_VISIT_FORM);
	const [hospitalityRows, setHospitalityRows] = useState<HospitalityRow[]>([]);
	const [notes, setNotes] = useState("");
	const [detailsSaving, setDetailsSaving] = useState(false);
	const [visitSaving, setVisitSaving] = useState(false);

	const [recModalOpen, setRecModalOpen] = useState(false);
	const [recForm, setRecForm] = useState(EMPTY_RECOMMENDATION_FORM);
	const [qualifications, setQualifications] = useState<Record<string, boolean>>({});
	const [recSaving, setRecSaving] = useState(false);
	const [recPanelKey, setRecPanelKey] = useState(0);

	const load = useCallback(async () => {
		const [visitsRes, publishersRes] = await Promise.all([fetch("/api/co-visit/schedules"), fetch("/api/publishers")]);
		if (visitsRes.ok) {
			const body = (await visitsRes.json()) as { items: Visit[] };
			setVisits(body.items);
			if (!selectedVisitId && body.items.length > 0) setSelectedVisitId(body.items[0].id);
		}
		if (publishersRes.ok) setPublishers(((await publishersRes.json()) as { items: PublisherOption[] }).items);
		// selectedVisitId se lee solo para el auto-select inicial, no queremos
		// recargar cuando el usuario mismo cambia la selección.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const loadAuxPioneers = useCallback(async (visitId: string) => {
		const res = await fetch(`/api/co-visit/schedules/${visitId}/auxiliary-pioneers`);
		if (res.ok) setAuxPioneerIds(new Set(((await res.json()) as { userIds: string[] }).userIds));
	}, []);

	useEffect(() => {
		if (selectedVisitId) loadAuxPioneers(selectedVisitId);
	}, [selectedVisitId, loadAuxPioneers]);

	function openCreateVisit() {
		setEditingVisit(null);
		setVisitForm(EMPTY_VISIT_FORM);
		setVisitModalOpen(true);
	}

	function openEditVisit(visit: Visit) {
		setEditingVisit(visit);
		setVisitForm({
			circuitOverseerName: visit.circuitOverseerName,
			startDate: visit.startDate,
			endDate: visit.endDate,
			midweekMeetingModifications: visit.midweekMeetingModifications,
		});
		setVisitModalOpen(true);
	}

	function addHospitalityRow() {
		setHospitalityRows((rows) => [...rows, { date: "", lunch: "", dinner: "" }]);
	}

	function updateHospitalityRow(index: number, field: keyof HospitalityRow, value: string) {
		setHospitalityRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
	}

	function removeHospitalityRow(index: number) {
		setHospitalityRows((rows) => rows.filter((_, i) => i !== index));
	}

	async function handleSaveVisit() {
		setVisitSaving(true);
		const body = visitForm;
		if (editingVisit) {
			await fetch(`/api/co-visit/schedules/${editingVisit.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		} else {
			await fetch("/api/co-visit/schedules", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		}
		setVisitSaving(false);
		setVisitModalOpen(false);
		load();
	}

	async function handleSaveDetails() {
		if (!selectedVisitId) return;
		setDetailsSaving(true);
		const hospitalitySchedule = Object.fromEntries(
			hospitalityRows.filter((r) => r.date).map((r) => [r.date, { lunch: r.lunch || null, dinner: r.dinner || null }]),
		);
		await fetch(`/api/co-visit/schedules/${selectedVisitId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ notes: notes || null, hospitalitySchedule }),
		});
		setDetailsSaving(false);
		load();
	}

	async function handleSaveAuxPioneers() {
		if (!selectedVisitId) return;
		setSavingAuxPioneers(true);
		setAuxPioneersError(null);
		const response = await fetch(`/api/co-visit/schedules/${selectedVisitId}/auxiliary-pioneers`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userIds: [...auxPioneerIds] }),
		});
		setSavingAuxPioneers(false);
		if (!response.ok) setAuxPioneersError("No se pudo guardar. Intenta de nuevo.");
	}

	function openCreateRecommendation() {
		setRecForm(EMPTY_RECOMMENDATION_FORM);
		setQualifications({});
		setRecModalOpen(true);
	}

	async function handleSaveRecommendation() {
		setRecSaving(true);
		await fetch("/api/co-recommendations", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...recForm,
				removalDate: recForm.removalDate || null,
				removalReason: recForm.removalReason || null,
				visitId: selectedVisitId,
				biblicalQualificationsCheck: qualifications,
			}),
		});
		setRecSaving(false);
		setRecModalOpen(false);
		// El panel de decisiones (S-62) tiene su propio estado: se vuelve a montar para que muestre la recomendación nueva.
		setRecPanelKey((k) => k + 1);
	}

	// Solo varones que aún no son ancianos pueden ser recomendados.
	const candidateOptions = publishers.filter(
		(p) => p.gender === "male" && !p.appointments.some((a) => a.appointmentType === "elder" && !a.endDate),
	);
	const selectedVisit = visits.find((v) => v.id === selectedVisitId) ?? null;

	// Carga notas y hospitalidad de la visita elegida en la tarjeta de detalles.
	useEffect(() => {
		setNotes(selectedVisit?.notes ?? "");
		setHospitalityRows(
			Object.entries(selectedVisit?.hospitalitySchedule ?? {}).map(([date, v]) => ({
				date,
				lunch: v.lunch ?? "",
				dinner: v.dinner ?? "",
			})),
		);
	}, [selectedVisit]);

	const today = new Date().toISOString().slice(0, 10);
	const isUpcoming = !!selectedVisit && selectedVisit.endDate >= today;

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Visita del SC"
				subtitle="Agenda de la visita, precursores auxiliares 15h y recomendaciones S-62."
			/>

			{visits.length === 0 && <p className="px-1 text-sm text-ink-soft">Todavía no hay visitas agendadas.</p>}

			{selectedVisit && (
				<>
					<Segmented
						label="Secciones de la visita"
						value={tab}
						onChange={setTab}
						options={[
							{ value: "agenda", label: "Agenda" },
							{ value: "pioneers", label: "Precursores" },
							{ value: "s62", label: "S-62" },
						]}
					/>

					{tab === "agenda" && (
						<>
							<div className="rounded-[20px] bg-surface p-4">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="text-[13px] text-ink-soft">{isUpcoming ? "Próxima visita" : "Visita"}</div>
										<div className="mt-0.5 font-display text-xl font-medium leading-snug text-ink">
											{formatShortDate(selectedVisit.startDate)} — {formatShortDate(selectedVisit.endDate)}
										</div>
										<div className="mt-1 text-[13px] text-ink-soft">Superintendente: {selectedVisit.circuitOverseerName}</div>
										{selectedVisit.midweekMeetingModifications && (
											<div className="mt-2">
												<Badge tone="warning">Modifica entre semana</Badge>
											</div>
										)}
									</div>
									<IconButton label="Editar visita" icon={Pencil} onClick={() => openEditVisit(selectedVisit)} />
								</div>
							</div>

							{visits.length > 1 && (
								<section>
									<SectionLabel>Visitas</SectionLabel>
									<List>
										{visits.map((v) => (
											<ListRow
												key={v.id}
												title={v.circuitOverseerName}
												subtitle={`${formatShortDate(v.startDate)} — ${formatShortDate(v.endDate)}`}
												onClick={() => setSelectedVisitId(v.id)}
												trailing={v.id === selectedVisitId ? <Check size={20} className="text-accent" /> : undefined}
											/>
										))}
									</List>
								</section>
							)}

							<section>
								<SectionLabel>Notas y hospitalidad (sfg 15:2-3)</SectionLabel>
								<Card className="flex flex-col gap-3">
									<Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
									{hospitalityRows.map((row, i) => (
										<div key={i} className="flex items-end gap-1 border-t border-border pt-3">
											<div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3">
												<div className="col-span-2 md:col-span-1">
													<Input
														label="Fecha"
														type="date"
														value={row.date}
														onChange={(e) => updateHospitalityRow(i, "date", e.target.value)}
													/>
												</div>
												<Input label="Almuerzo" value={row.lunch} onChange={(e) => updateHospitalityRow(i, "lunch", e.target.value)} />
												<Input label="Cena" value={row.dinner} onChange={(e) => updateHospitalityRow(i, "dinner", e.target.value)} />
											</div>
											<IconButton label="Quitar día" icon={Trash2} tone="danger" onClick={() => removeHospitalityRow(i)} />
										</div>
									))}
									<div className="flex flex-wrap gap-2 pt-1">
										<Button variant="secondary" onClick={addHospitalityRow}>
											<Plus size={18} />
											Agregar día
										</Button>
										<Button onClick={handleSaveDetails} disabled={detailsSaving}>
											{detailsSaving ? "Guardando..." : "Guardar"}
										</Button>
									</div>
								</Card>
							</section>
						</>
					)}

					{tab === "pioneers" && (
						<section>
							<SectionLabel>Precursores auxiliares 15h (sfg 15:1)</SectionLabel>
							<p className="mb-2 px-1 text-[13px] text-ink-soft">{selectedVisit.circuitOverseerName}</p>
							<Card className="flex flex-col gap-1">
								<SelectAllControls
									onSelectAll={() => setAuxPioneerIds(new Set(publishers.map((p) => p.id)))}
									onClearAll={() => setAuxPioneerIds(new Set())}
								/>
								<div className="-mx-2 flex max-h-96 flex-col overflow-y-auto">
									{publishers.map((p) => (
										<label key={p.id} className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-base text-ink hover:bg-surface-alt">
											<input
												type="checkbox"
												className="h-5 w-5 shrink-0 accent-accent"
												checked={auxPioneerIds.has(p.id)}
												onChange={(e) => {
													setAuxPioneerIds((prev) => {
														const next = new Set(prev);
														if (e.target.checked) next.add(p.id);
														else next.delete(p.id);
														return next;
													});
												}}
											/>
											{p.fullName}
										</label>
									))}
								</div>
								{auxPioneersError && <p className="mt-2 text-sm text-red-600">{auxPioneersError}</p>}
								<div className="pt-3">
									<Button onClick={handleSaveAuxPioneers} disabled={savingAuxPioneers}>
										{savingAuxPioneers ? "Guardando..." : "Guardar"}
									</Button>
								</div>
							</Card>
						</section>
					)}

					{tab === "s62" && <RecommendationsDecisionPanel key={recPanelKey} visitId={selectedVisit.id} />}
				</>
			)}

			{(tab === "agenda" || !selectedVisit) && <Fab label="Nueva visita" icon={Plus} onClick={openCreateVisit} />}
			{tab === "s62" && selectedVisit && <Fab label="Nueva recomendación" icon={Plus} onClick={openCreateRecommendation} />}

			<Modal open={visitModalOpen} onClose={() => setVisitModalOpen(false)} title={editingVisit ? "Editar visita" : "Nueva visita"}>
				<div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
					<Input
						label="Nombre del superintendente de circuito"
						value={visitForm.circuitOverseerName}
						onChange={(e) => setVisitForm((f) => ({ ...f, circuitOverseerName: e.target.value }))}
					/>
					<div className="grid grid-cols-2 gap-3">
						<Input
							label="Inicio"
							type="date"
							value={visitForm.startDate}
							onChange={(e) => setVisitForm((f) => ({ ...f, startDate: e.target.value }))}
						/>
						<Input
							label="Fin"
							type="date"
							value={visitForm.endDate}
							onChange={(e) => setVisitForm((f) => ({ ...f, endDate: e.target.value }))}
						/>
					</div>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={visitForm.midweekMeetingModifications}
							onChange={(e) => setVisitForm((f) => ({ ...f, midweekMeetingModifications: e.target.checked }))}
						/>
						Reemplaza el Estudio Bíblico por el discurso de servicio (S-38 párr. 21)
					</label>
					<Button onClick={handleSaveVisit} disabled={visitSaving || !visitForm.circuitOverseerName} className="mt-2">
						{visitSaving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>

			<Modal open={recModalOpen} onClose={() => setRecModalOpen(false)} title="Nueva recomendación S-62">
				<div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
					<Select
						label="Candidato"
						value={recForm.candidateUserId}
						onChange={(e) => setRecForm((f) => ({ ...f, candidateUserId: e.target.value }))}
					>
						<option value="">Selecciona</option>
						{candidateOptions.map((p) => (
							<option key={p.id} value={p.id}>
								{p.fullName}
							</option>
						))}
					</Select>
					<Select
						label="Nombramiento recomendado"
						value={recForm.recommendedOffice}
						onChange={(e) => setRecForm((f) => ({ ...f, recommendedOffice: e.target.value }))}
					>
						{Object.entries(OFFICE_LABELS).map(([code, label]) => (
							<option key={code} value={code}>
								{label}
							</option>
						))}
					</Select>
					<div className="flex flex-col gap-1">
						<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
							<input
								type="radio"
								className="h-5 w-5 shrink-0 accent-accent"
								checked={recForm.isFirstTime}
								onChange={() => setRecForm((f) => ({ ...f, isFirstTime: true, isReappointment: false }))}
							/>
							Primera vez
						</label>
						<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
							<input
								type="radio"
								className="h-5 w-5 shrink-0 accent-accent"
								checked={recForm.isReappointment}
								onChange={() => setRecForm((f) => ({ ...f, isFirstTime: false, isReappointment: true }))}
							/>
							Renombramiento (baja en los últimos 5 años, sfg 5:6)
						</label>
					</div>
					{recForm.isReappointment && (
						<div className="grid grid-cols-2 gap-3">
							<Input
								label="Fecha de la baja"
								type="date"
								value={recForm.removalDate}
								onChange={(e) => setRecForm((f) => ({ ...f, removalDate: e.target.value }))}
							/>
							<Input
								label="Motivo"
								value={recForm.removalReason}
								onChange={(e) => setRecForm((f) => ({ ...f, removalReason: e.target.value }))}
							/>
						</div>
					)}
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={recForm.previousCongregationLetterAttached}
							onChange={(e) => setRecForm((f) => ({ ...f, previousCongregationLetterAttached: e.target.checked }))}
						/>
						Carta de la congregación anterior adjunta (sfg 5:11)
					</label>

					<p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
						Calificaciones bíblicas (1 Tim. 3 / Tito 1)
					</p>
					{Object.entries(QUALIFICATION_LABELS).map(([key, label]) => (
						<label key={key} className="flex min-h-11 items-center gap-3 text-sm text-ink">
							<input
								type="checkbox"
								className="h-5 w-5 shrink-0 accent-accent"
								checked={!!qualifications[key]}
								onChange={(e) => setQualifications((q) => ({ ...q, [key]: e.target.checked }))}
							/>
							{label}
						</label>
					))}

					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={recForm.threeMandatoryQuestionsConfirmed}
							onChange={(e) => setRecForm((f) => ({ ...f, threeMandatoryQuestionsConfirmed: e.target.checked }))}
						/>
						Las 3 preguntas clave del SC fueron confirmadas (sfg 5:8)
					</label>

					<Button onClick={handleSaveRecommendation} disabled={recSaving || !recForm.candidateUserId} className="mt-2">
						{recSaving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
