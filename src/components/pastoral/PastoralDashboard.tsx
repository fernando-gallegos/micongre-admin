"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Plus, Trash2, UserPlus } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Fab, IconButton, List, ListRow, PageHeader, SectionLabel, Segmented } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { formatShortDate } from "@/lib/dateFormat";

interface PriorityEntry {
	id: string;
	fullName: string;
	noReportLastMonth: boolean;
	recentlyBaptized: boolean;
	reducedReportEligible: boolean;
	hasOpenPastoralFlag: boolean;
}

interface PioneerAlert {
	id: string;
	fullName: string;
	hoursSoFar: number;
	expectedByNow: number;
}

interface MonthlyAggregate {
	periodYear: number;
	periodMonth: number;
	publishersReportingCount: number;
	totalHoursPioneers: number;
	totalBibleStudies: number;
}

interface Visit {
	id: string;
	publisherId: string;
	publisherName: string;
	dateVisited: string;
	eldersAssigned: string[];
	scripturesConsidered: string | null;
	followUpNeeded: boolean;
	confidentialNotes: string | null;
	visibleToAllElders: boolean;
	redacted: boolean;
}

interface Flag {
	id: string;
	publisherId: string;
	publisherName: string;
	reason: string;
	createdAt: string;
	resolvedAt: string | null;
}

interface AssistanceRequest {
	id: string;
	publisherId: string;
	publisherName: string;
	type: string;
	requestDate: string;
	status: string;
	assignedElders: string[];
	resolutionSummary: string | null;
}

interface PublisherOption {
	id: string;
	fullName: string;
}

interface VisitRequest {
	id: string;
	publisherId: string;
	publisherName: string;
	requestedDate: string;
	notes: string | null;
	assignedElders: string[] | null;
	status: "pending" | "completed" | "cancelled" | "postponed";
}

const VISIT_REQUEST_STATUS_BADGE: Record<
	VisitRequest["status"],
	{ label: string; tone: "warning" | "success" | "danger" | "neutral" }
> = {
	pending: { label: "Pendiente", tone: "warning" },
	completed: { label: "Completado", tone: "success" },
	postponed: { label: "Postergado", tone: "neutral" },
	cancelled: { label: "Cancelado", tone: "danger" },
};

interface ElderOption {
	id: string;
	fullName: string;
}

const MONTH_LABELS = [
	"", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const ASSISTANCE_TYPE_LABELS: Record<string, string> = {
	MEDICAL_HLC: "Enlace con el CEH (médico)",
	MATERIAL_AID: "Ayuda material",
	REMOTE_CONNECTION: "Conexión remota a reuniones",
	OTHER: "Otro",
};

const ASSISTANCE_STATUS_LABELS: Record<string, string> = {
	RECEIVED: "Recibida",
	UNDER_EVALUATION: "En evaluación",
	IN_PROGRESS: "En proceso",
	RESOLVED: "Resuelta",
};

const EMPTY_VISIT_FORM = {
	publisherId: "",
	dateVisited: new Date().toISOString().slice(0, 10),
	eldersAssigned: [] as string[],
	scripturesConsidered: "",
	followUpNeeded: false,
	confidentialNotes: "",
};

const EMPTY_ASSISTANCE_FORM = {
	publisherId: "",
	type: "MEDICAL_HLC",
	requestDate: new Date().toISOString().slice(0, 10),
};

export function PastoralDashboard() {
	const [tab, setTab] = useState<"priority" | "requests" | "visits">("priority");
	const [priorityMatrix, setPriorityMatrix] = useState<PriorityEntry[]>([]);
	const [pioneerAlerts, setPioneerAlerts] = useState<PioneerAlert[]>([]);
	const [months, setMonths] = useState<MonthlyAggregate[]>([]);
	const [visits, setVisits] = useState<Visit[]>([]);
	const [flags, setFlags] = useState<Flag[]>([]);
	const [requests, setRequests] = useState<AssistanceRequest[]>([]);
	const [publishers, setPublishers] = useState<PublisherOption[]>([]);
	const [forbidden, setForbidden] = useState(false);

	const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
	const [elders, setElders] = useState<ElderOption[]>([]);
	const [isCommittee, setIsCommittee] = useState(false);
	const [assigningId, setAssigningId] = useState<string | null>(null);
	const [assignElder1, setAssignElder1] = useState("");
	const [assignElder2, setAssignElder2] = useState("");
	const [assignError, setAssignError] = useState<string | null>(null);

	const [visitModalOpen, setVisitModalOpen] = useState(false);
	const [visitForm, setVisitForm] = useState(EMPTY_VISIT_FORM);
	const [visitSaving, setVisitSaving] = useState(false);

	const [assistanceModalOpen, setAssistanceModalOpen] = useState(false);
	const [assistanceForm, setAssistanceForm] = useState(EMPTY_ASSISTANCE_FORM);
	const [assistanceSaving, setAssistanceSaving] = useState(false);

	const load = useCallback(async () => {
		const priorityRes = await fetch("/api/pastoral/priority-matrix");
		if (priorityRes.status === 403) {
			setForbidden(true);
			return;
		}
		setForbidden(false);
		const [priorityBody, aggRes, visitsRes, flagsRes, requestsRes, publishersRes] = await Promise.all([
			priorityRes.json() as Promise<{ items: PriorityEntry[] }>,
			fetch("/api/pastoral/monthly-aggregates").then((r) => r.json()) as Promise<{
				months: MonthlyAggregate[];
				pioneerAlerts: PioneerAlert[];
			}>,
			fetch("/api/pastoral/visits").then((r) => r.json()) as Promise<{ items: Visit[] }>,
			fetch("/api/pastoral/flags").then((r) => r.json()) as Promise<{ items: Flag[] }>,
			fetch("/api/assistance-requests").then((r) => r.json()) as Promise<{ items: AssistanceRequest[] }>,
			fetch("/api/publishers").then((r) => r.json()) as Promise<{ items: PublisherOption[] }>,
		]);
		setPriorityMatrix(priorityBody.items);
		setMonths(aggRes.months);
		setPioneerAlerts(aggRes.pioneerAlerts);
		setVisits(visitsRes.items);
		setFlags(flagsRes.items);
		setRequests(requestsRes.items);
		setPublishers(publishersRes.items);

		const visitRequestsRes = await fetch("/api/pastoral/visit-requests");
		if (visitRequestsRes.ok) {
			const body = (await visitRequestsRes.json()) as { items: VisitRequest[]; elders: ElderOption[] };
			setVisitRequests(body.items);
			setElders(body.elders);
			setIsCommittee(true);
		} else {
			setIsCommittee(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const publisherName = (id: string) => publishers.find((p) => p.id === id)?.fullName ?? "—";

	function openCreateVisit(publisherId?: string) {
		setVisitForm(publisherId ? { ...EMPTY_VISIT_FORM, publisherId } : EMPTY_VISIT_FORM);
		setVisitModalOpen(true);
	}

	async function handleSaveVisit() {
		setVisitSaving(true);
		await fetch("/api/pastoral/visits", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...visitForm,
				scripturesConsidered: visitForm.scripturesConsidered || null,
				confidentialNotes: visitForm.confidentialNotes || null,
			}),
		});
		setVisitSaving(false);
		setVisitModalOpen(false);
		load();
	}

	async function toggleVisitVisibility(visit: Visit) {
		await fetch(`/api/pastoral/visits/${visit.id}/visibility`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visibleToAllElders: !visit.visibleToAllElders }),
		});
		load();
	}

	function openAssign(request: VisitRequest) {
		setAssigningId(request.id);
		setAssignElder1("");
		setAssignElder2("");
		setAssignError(null);
	}

	async function saveAssign() {
		if (!assigningId) return;
		if (!assignElder1 || !assignElder2 || assignElder1 === assignElder2) {
			setAssignError("Selecciona 2 ancianos distintos.");
			return;
		}
		const response = await fetch(`/api/pastoral/visit-requests/${assigningId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ assignedElders: [assignElder1, assignElder2] }),
		});
		if (!response.ok) {
			setAssignError("No se pudo asignar.");
			return;
		}
		setAssigningId(null);
		load();
	}

	async function cancelVisitRequest(id: string) {
		await fetch(`/api/pastoral/visit-requests/${id}`, { method: "DELETE" });
		load();
	}

	async function resolveFlag(flag: Flag) {
		await fetch(`/api/pastoral/flags/${flag.id}/resolve`, { method: "PATCH" });
		load();
	}

	function openCreateAssistance() {
		setAssistanceForm(EMPTY_ASSISTANCE_FORM);
		setAssistanceModalOpen(true);
	}

	async function handleSaveAssistance() {
		setAssistanceSaving(true);
		await fetch("/api/assistance-requests", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(assistanceForm),
		});
		setAssistanceSaving(false);
		setAssistanceModalOpen(false);
		load();
	}

	async function updateRequestStatus(request: AssistanceRequest, status: string) {
		await fetch(`/api/assistance-requests/${request.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status }),
		});
		load();
	}

	if (forbidden) {
		return (
			<div className="flex flex-col gap-5">
				<PageHeader title="Pastoreo" />
				<Card>
					<p className="text-sm text-ink-soft">
						No tienes acceso pastoral (se otorga automáticamente a ancianos con nombramiento activo).
					</p>
				</Card>
			</div>
		);
	}

	const emptyNote = (text: string) => <p className="px-1 text-sm text-ink-soft">{text}</p>;

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Pastoreo" />

			<Segmented
				label="Secciones de pastoreo"
				value={tab}
				onChange={setTab}
				options={[
					{ value: "priority", label: "Prioridad" },
					{ value: "requests", label: "Solicitudes" },
					{ value: "visits", label: "Visitas" },
				]}
			/>

			{tab === "priority" && (
				<>
					<section>
						<SectionLabel>Atención sugerida</SectionLabel>
						{priorityMatrix.length === 0 ? (
							emptyNote("Nadie con banderas de prioridad alta ahora mismo.")
						) : (
							<List>
								{priorityMatrix.map((p) => (
									<ListRow
										key={p.id}
										title={p.fullName}
										subtitle={
											<span className="flex flex-wrap items-center gap-1.5">
												{p.noReportLastMonth && <Badge tone="warning">Sin informe el mes pasado</Badge>}
												{p.recentlyBaptized && <Badge tone="success">Recién bautizado</Badge>}
												{p.reducedReportEligible && <Badge tone="neutral">Informe reducido</Badge>}
												{p.hasOpenPastoralFlag && <Badge tone="danger">Marcado por el grupo</Badge>}
											</span>
										}
										trailing={
											<IconButton
												label="Registrar visita"
												icon={Plus}
												tone="accent"
												onClick={() => openCreateVisit(p.id)}
											/>
										}
									/>
								))}
							</List>
						)}
					</section>

					{pioneerAlerts.length > 0 && (
						<section>
							<SectionLabel>Precursores bajo el ritmo anual (sfg 14:5)</SectionLabel>
							<List>
								{pioneerAlerts.map((p) => (
									<ListRow key={p.id} title={p.fullName} subtitle={`${p.hoursSoFar}h de ${p.expectedByNow}h esperadas`} />
								))}
							</List>
						</section>
					)}

					<section>
						<SectionLabel>Casos marcados por grupos de servicio</SectionLabel>
						{flags.length === 0 ? (
							emptyNote("Sin banderas registradas.")
						) : (
							<List>
								{flags.map((f) => (
									<ListRow
										key={f.id}
										title={f.publisherName}
										subtitle={f.reason}
										trailing={
											f.resolvedAt ? (
												<Badge tone="neutral">Resuelto</Badge>
											) : (
												<IconButton label="Marcar resuelto" icon={CheckCircle2} tone="accent" onClick={() => resolveFlag(f)} />
											)
										}
									/>
								))}
							</List>
						)}
					</section>

					<section>
						<SectionLabel>Métricas mensuales</SectionLabel>
						{months.length === 0 ? (
							emptyNote("Sin métricas todavía.")
						) : (
							<List>
								{months.map((m) => (
									<ListRow
										key={`${m.periodYear}-${m.periodMonth}`}
										title={`${MONTH_LABELS[m.periodMonth]} ${m.periodYear}`}
										subtitle={`${m.publishersReportingCount} publicadores informaron · ${m.totalHoursPioneers} h de precursores · ${m.totalBibleStudies} cursos bíblicos`}
									/>
								))}
							</List>
						)}
					</section>
				</>
			)}

			{tab === "requests" && (
				<>
					{isCommittee && (
						<section>
							<SectionLabel>Solicitudes de pastoreo</SectionLabel>
							{visitRequests.length === 0 ? (
								emptyNote("Sin solicitudes de pastoreo.")
							) : (
								<List>
									{visitRequests.map((r) => (
										<div key={r.id} className="px-4 py-3">
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0 flex-1">
													<div className="text-base font-semibold text-ink">{r.publisherName}</div>
													<div className="mt-0.5 text-[13px] text-ink-soft">
														{formatShortDate(r.requestedDate)}
														{r.notes ? ` · ${r.notes}` : ""}
													</div>
													{r.assignedElders && (
														<div className="mt-0.5 text-[13px] text-ink-soft">Ancianos: {r.assignedElders.join(", ")}</div>
													)}
												</div>
												{r.assignedElders ? (
													<Badge tone={VISIT_REQUEST_STATUS_BADGE[r.status].tone}>
														{VISIT_REQUEST_STATUS_BADGE[r.status].label}
													</Badge>
												) : assigningId === r.id ? null : (
													<div className="-my-1 -mr-2 flex shrink-0 items-center">
														<IconButton label="Asignar ancianos" icon={UserPlus} tone="accent" onClick={() => openAssign(r)} />
														<IconButton label="Eliminar" icon={Trash2} tone="danger" onClick={() => cancelVisitRequest(r.id)} />
													</div>
												)}
											</div>
											{!r.assignedElders && assigningId === r.id && (
												<div className="mt-3 flex flex-col gap-2">
													<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
														<Select label="Anciano 1" value={assignElder1} onChange={(e) => setAssignElder1(e.target.value)}>
															<option value="">Selecciona</option>
															{elders.map((e) => (
																<option key={e.id} value={e.id}>
																	{e.fullName}
																</option>
															))}
														</Select>
														<Select label="Anciano 2" value={assignElder2} onChange={(e) => setAssignElder2(e.target.value)}>
															<option value="">Selecciona</option>
															{elders.map((e) => (
																<option key={e.id} value={e.id}>
																	{e.fullName}
																</option>
															))}
														</Select>
													</div>
													{assignError && <p className="text-xs text-red-600">{assignError}</p>}
													<div className="flex gap-2">
														<Button variant="secondary" onClick={() => setAssigningId(null)}>
															Cancelar
														</Button>
														<Button onClick={saveAssign}>Guardar</Button>
													</div>
												</div>
											)}
										</div>
									))}
								</List>
							)}
						</section>
					)}

					<section>
						<SectionLabel>Solicitudes de asistencia</SectionLabel>
						{requests.length === 0 ? (
							emptyNote("Sin solicitudes registradas.")
						) : (
							<List>
								{requests.map((r) => (
									<div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0">
											<div className="text-base font-semibold text-ink">{r.publisherName}</div>
											<div className="mt-0.5 text-[13px] text-ink-soft">
												{ASSISTANCE_TYPE_LABELS[r.type] ?? r.type} · {formatShortDate(r.requestDate)}
											</div>
										</div>
										<Select value={r.status} onChange={(e) => updateRequestStatus(r, e.target.value)}>
											{Object.entries(ASSISTANCE_STATUS_LABELS).map(([code, label]) => (
												<option key={code} value={code}>
													{label}
												</option>
											))}
										</Select>
									</div>
								))}
							</List>
						)}
					</section>
				</>
			)}

			{tab === "visits" && (
				<section>
					<SectionLabel>Visitas de pastoreo</SectionLabel>
					{visits.length === 0 ? (
						emptyNote("Todavía no hay visitas registradas.")
					) : (
						<List>
							{visits.map((v) => (
								<div key={v.id} className="px-4 py-3">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<div className="text-base font-semibold text-ink">{v.publisherName}</div>
											<div className="mt-0.5 text-[13px] text-ink-soft">
												{formatShortDate(v.dateVisited)} · Ancianos: {v.eldersAssigned.map((id) => publisherName(id)).join(", ")}
											</div>
											{v.followUpNeeded && (
												<div className="mt-1.5">
													<Badge tone="warning">Requiere seguimiento</Badge>
												</div>
											)}
										</div>
										<div className="-my-1 -mr-2">
											<IconButton
												label={v.visibleToAllElders ? "Volver confidencial" : "Hacer visible para todos los ancianos"}
												icon={v.visibleToAllElders ? EyeOff : Eye}
												onClick={() => toggleVisitVisibility(v)}
											/>
										</div>
									</div>
									{v.scripturesConsidered && <p className="mt-1 text-[13px] text-ink-soft">Textos: {v.scripturesConsidered}</p>}
									{v.redacted ? (
										<p className="mt-1 text-[13px] italic text-ink-soft">Notas confidenciales — sin acceso.</p>
									) : (
										v.confidentialNotes && <p className="mt-1 text-sm text-ink">{v.confidentialNotes}</p>
									)}
								</div>
							))}
						</List>
					)}
				</section>
			)}

			<p className="px-1 text-[13px] leading-relaxed text-ink-soft">
				Las notas de pastoreo son confidenciales y solo las ven los ancianos.
			</p>

			{tab === "requests" && <Fab label="Nueva solicitud" icon={Plus} onClick={openCreateAssistance} />}
			{tab === "visits" && <Fab label="Nueva visita" icon={Plus} onClick={() => openCreateVisit()} />}

			<Modal open={visitModalOpen} onClose={() => setVisitModalOpen(false)} title="Nueva visita de pastoreo">
				<div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
					<Select
						label="Publicador"
						value={visitForm.publisherId}
						onChange={(e) => setVisitForm((f) => ({ ...f, publisherId: e.target.value }))}
					>
						<option value="">Selecciona</option>
						{publishers.map((p) => (
							<option key={p.id} value={p.id}>
								{p.fullName}
							</option>
						))}
					</Select>
					<Input
						label="Fecha"
						type="date"
						value={visitForm.dateVisited}
						onChange={(e) => setVisitForm((f) => ({ ...f, dateVisited: e.target.value }))}
					/>
					<div>
						<p className="mb-1 text-sm font-medium text-ink">Ancianos que participaron</p>
						<div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-2xl border border-border px-3 py-1">
							{publishers.map((p) => (
								<label key={p.id} className="flex min-h-11 items-center gap-3 text-sm text-ink">
									<input
										type="checkbox"
										className="h-5 w-5 shrink-0 accent-accent"
										checked={visitForm.eldersAssigned.includes(p.id)}
										onChange={(e) =>
											setVisitForm((f) => ({
												...f,
												eldersAssigned: e.target.checked
													? [...f.eldersAssigned, p.id]
													: f.eldersAssigned.filter((id) => id !== p.id),
											}))
										}
									/>
									{p.fullName}
								</label>
							))}
						</div>
					</div>
					<Input
						label="Textos bíblicos considerados"
						value={visitForm.scripturesConsidered}
						onChange={(e) => setVisitForm((f) => ({ ...f, scripturesConsidered: e.target.value }))}
					/>
					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={visitForm.followUpNeeded}
							onChange={(e) => setVisitForm((f) => ({ ...f, followUpNeeded: e.target.checked }))}
						/>
						Requiere seguimiento
					</label>
					<Input
						label="Notas confidenciales"
						value={visitForm.confidentialNotes}
						onChange={(e) => setVisitForm((f) => ({ ...f, confidentialNotes: e.target.value }))}
					/>
					<Button
						onClick={handleSaveVisit}
						disabled={visitSaving || !visitForm.publisherId || visitForm.eldersAssigned.length === 0}
					>
						{visitSaving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>

			<Modal open={assistanceModalOpen} onClose={() => setAssistanceModalOpen(false)} title="Nueva solicitud de asistencia">
				<div className="flex flex-col gap-3">
					<Select
						label="Publicador"
						value={assistanceForm.publisherId}
						onChange={(e) => setAssistanceForm((f) => ({ ...f, publisherId: e.target.value }))}
					>
						<option value="">Selecciona</option>
						{publishers.map((p) => (
							<option key={p.id} value={p.id}>
								{p.fullName}
							</option>
						))}
					</Select>
					<Select
						label="Tipo"
						value={assistanceForm.type}
						onChange={(e) => setAssistanceForm((f) => ({ ...f, type: e.target.value }))}
					>
						{Object.entries(ASSISTANCE_TYPE_LABELS).map(([code, label]) => (
							<option key={code} value={code}>
								{label}
							</option>
						))}
					</Select>
					<Input
						label="Fecha"
						type="date"
						value={assistanceForm.requestDate}
						onChange={(e) => setAssistanceForm((f) => ({ ...f, requestDate: e.target.value }))}
					/>
					<Button onClick={handleSaveAssistance} disabled={assistanceSaving || !assistanceForm.publisherId}>
						{assistanceSaving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
