"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { BrotherSelector } from "@/components/shared/BrotherSelector";
import { SongSelect } from "@/components/shared/SongSelect";
import { AutoAssignButton } from "@/components/assignments/AutoAssignButton";
import { SendAssignmentsButton } from "@/components/shared/SendAssignmentsButton";
import { formatLongDate } from "@/lib/dateFormat";
import type { EligibleUser } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS, SECTION_GROUP_BY_TYPE, SECTION_GROUP_LABELS, SECTION_LABELS } from "@/lib/rbac/roles";
import { getStudentPartRule, STUDENT_PART_TITLES } from "@/lib/rbac/studentParts";
import { PageLoader } from "@/components/ui/Spinner";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

interface Assignment {
	id: string;
	sectionType: string;
	sectionTitle: string | null;
	description: string | null;
	sequenceOrder: number;
	partNumber: number | null;
	room: "main" | "auxiliary";
	durationMinutes: number | null;
	privilegeId: string | null;
	mainAssigneeId: string | null;
	assistantAssigneeId: string | null;
	mainAssigneeName: string | null;
	assistantAssigneeName: string | null;
}

interface Meeting {
	id: string;
	meetingDate: string;
	weekLabel: string | null;
	status: string;
	chairmanUserId: string | null;
	openingSongNumber: number | null;
	closingSongNumber: number | null;
	middleSongNumber: number | null;
	openingPrayerUserId: string | null;
	studyLessonReference: string | null;
	hasAuxRoom: boolean;
	notes: string | null;
}

// Superconjunto de privilegios que puede necesitar esta pantalla — se pide
// una sola vez en un request batcheado, así una parte de estudiante nueva ya
// tiene su lista de elegibles lista sin otro round-trip.
const ALL_PRIVILEGE_IDS = [
	PRIVILEGE_IDS.MIDWEEK_CHAIRMAN,
	PRIVILEGE_IDS.TREASURES_TALK,
	PRIVILEGE_IDS.SPIRITUAL_GEMS,
	PRIVILEGE_IDS.BIBLE_READING,
	PRIVILEGE_IDS.STUDENT_ASSIGNMENT,
	PRIVILEGE_IDS.CHRISTIAN_LIVING,
	PRIVILEGE_IDS.CONGREGATION_NEEDS,
	PRIVILEGE_IDS.CBS_CONDUCTOR,
	PRIVILEGE_IDS.CBS_READER,
	PRIVILEGE_IDS.CONGREGATION_PRAYER,
];

const GROUP_ORDER = ["treasures", "ministry", "living"] as const;
const REMOVABLE_SECTION_TYPES = ["student_assignment", "living_custom"];

// Clases escritas completas (no interpoladas) para que el scanner de
// contenido de Tailwind las detecte — ver tailwind.config.ts / globals.css.
const GROUP_STYLES: Record<(typeof GROUP_ORDER)[number], { header: string; dot: string; soft: string }> = {
	treasures: { header: "text-mwb-treasures", dot: "bg-mwb-treasures", soft: "bg-mwb-treasures-soft" },
	ministry: { header: "text-mwb-ministry", dot: "bg-mwb-ministry", soft: "bg-mwb-ministry-soft" },
	living: { header: "text-mwb-living", dot: "bg-mwb-living", soft: "bg-mwb-living-soft" },
};

// Encabezado de una parte: nunca el nombre de la sección. El título de la parte
// (el discurso de Tesoros, “¿Quién me tocó?”) o, en "Seamos mejores maestros",
// el tipo de asignación.
function titleIsHeader(row: Assignment): boolean {
	return (
		row.sectionType === "living_custom" ||
		(row.sectionType === "treasures_talk" && !!row.sectionTitle) ||
		(row.sectionType === "christian_living" && !!row.sectionTitle) ||
		(row.sectionType === "student_assignment" && !!row.sectionTitle)
	);
}

function headerLabel(row: Assignment): string {
	if (titleIsHeader(row)) return row.sectionTitle as string;
	if (row.sectionType === "treasures_talk") return "Discurso";
	return SECTION_LABELS[row.sectionType] ?? row.sectionType;
}

export function WeekBuilder({ meetingId }: { meetingId: string }) {
	const [savedMeeting, setSavedMeeting] = useState<Meeting | null>(null);
	const [skipOpeningPrayer, setSkipOpeningPrayer] = useState(false);
	const [savedAssignments, setSavedAssignments] = useState<Assignment[]>([]);
	// Cambios sin guardar: se envían todos juntos con el botón "Guardar".
	const [meetingDraft, setMeetingDraft] = useState<Partial<Meeting>>({});
	const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, Record<string, unknown>>>({});
	const [saving, setSaving] = useState(false);
	const [sendMessage, setSendMessage] = useState<string | null>(null);
	// Tareas operativas ya guardadas de esta reunión (solo para los avisos de doble asignación).
	const [opAssignments, setOpAssignments] = useState<{ userId: string; label: string }[]>([]);
	const [eligibleByPrivilege, setEligibleByPrivilege] = useState<Record<string, EligibleUser[]>>({});
	const [loading, setLoading] = useState(true);
	const [rowError, setRowError] = useState<Record<string, string>>({});
	const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
	const [customModalOpen, setCustomModalOpen] = useState(false);
	const [customTitle, setCustomTitle] = useState("");
	const [customDescription, setCustomDescription] = useState("");
	const [customPosition, setCustomPosition] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		const [detailRes, eligibleRes, opRes] = await Promise.all([
			fetch(`/api/midweek/${meetingId}`),
			fetch(`/api/privileges/eligible?privilegeIds=${ALL_PRIVILEGE_IDS.join(",")}`),
			fetch(`/api/operational/assignments?meetingType=midweek&meetingId=${meetingId}`),
		]);
		if (opRes.ok) setOpAssignments(((await opRes.json()) as { items: { userId: string; label: string }[] }).items);
		if (detailRes.ok) {
			const body = (await detailRes.json()) as { meeting: Meeting; assignments: Assignment[]; skipOpeningPrayer?: boolean };
			setSkipOpeningPrayer(!!body.skipOpeningPrayer);
			setSavedMeeting(body.meeting);
			setSavedAssignments(body.assignments);
		}
		if (eligibleRes.ok) {
			setEligibleByPrivilege(await eligibleRes.json());
		}
		setLoading(false);
	}, [meetingId]);

	useEffect(() => {
		load();
	}, [load]);

	function patchMeeting(patch: Partial<Meeting>) {
		setMeetingDraft((d) => ({ ...d, ...patch }));
	}

	function patchAssignment(assignmentId: string, patch: Record<string, unknown>) {
		setRowError((prev) => ({ ...prev, [assignmentId]: "" }));
		setAssignmentDrafts((d) => ({ ...d, [assignmentId]: { ...d[assignmentId], ...patch } }));
		setEditingTitleId(null);
	}

	/** Vuelca la propuesta de «Asignar automáticamente» al borrador (clave de casilla → persona); se guarda con «Guardar». */
	function applyAutoAssign(picks: Record<string, string>) {
		for (const [key, userId] of Object.entries(picks)) {
			if (key === "chairman") patchMeeting({ chairmanUserId: userId });
			else if (key === "openingPrayer") patchMeeting({ openingPrayerUserId: userId });
			else {
				const [, assignmentId, role] = key.split(":");
				if (role === "main") patchAssignment(assignmentId, { mainAssigneeId: userId });
				else if (role === "assistant") patchAssignment(assignmentId, { assistantAssigneeId: userId });
			}
		}
	}

	async function handleSave() {
		setSaving(true);
		const failed: Record<string, string> = {};
		const remaining: Record<string, Record<string, unknown>> = {};
		let meetingFailed = false;

		if (Object.keys(meetingDraft).length > 0) {
			const response = await fetch(`/api/midweek/${meetingId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(meetingDraft),
			});
			meetingFailed = !response.ok;
		}

		for (const [assignmentId, patch] of Object.entries(assignmentDrafts)) {
			if (!savedAssignments.some((a) => a.id === assignmentId)) continue;
			const response = await fetch(`/api/midweek/${meetingId}/assignments/${assignmentId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { error?: string };
				failed[assignmentId] = body.error ?? "No se pudo guardar.";
				remaining[assignmentId] = patch;
			}
		}

		setSaving(false);
		setRowError(failed);
		setAssignmentDrafts(remaining);
		if (!meetingFailed) setMeetingDraft({});
		load();
	}

	async function addStudentPart() {
		await fetch(`/api/midweek/${meetingId}/assignments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sectionType: "student_assignment" }),
		});
		load();
	}

	async function addCustomLivingPart() {
		await fetch(`/api/midweek/${meetingId}/assignments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sectionType: "living_custom",
				sectionTitle: customTitle,
				description: customDescription || null,
				position: customPosition ? Number(customPosition) : undefined,
			}),
		});
		setCustomModalOpen(false);
		setCustomTitle("");
		setCustomDescription("");
		setCustomPosition("");
		load();
	}

	async function removeAssignment(assignmentId: string) {
		await fetch(`/api/midweek/${meetingId}/assignments/${assignmentId}`, { method: "DELETE" });
		load();
	}

	useUnsavedChanges(Object.keys(meetingDraft).length > 0 || Object.keys(assignmentDrafts).length > 0);

	if (!savedMeeting) {
		return <PageLoader />;
	}
	const meeting: Meeting = { ...savedMeeting, ...meetingDraft };
	const assignments = savedAssignments.map((a) => ({ ...a, ...assignmentDrafts[a.id] }) as Assignment);
	const dirty = Object.keys(meetingDraft).length > 0 || Object.keys(assignmentDrafts).length > 0;

	// Aviso no bloqueante: la persona ya tiene otra parte en esta misma reunión.
	const slots: { key: string; label: string; userId: string | null }[] = [
		{ key: "chairman", label: "Presidente", userId: meeting.chairmanUserId },
		...(skipOpeningPrayer ? [] : [{ key: "openingPrayer", label: "Oración inicial", userId: meeting.openingPrayerUserId }]),
	];
	for (const a of assignments) {
		const label = a.sectionType === "living_custom" ? (a.sectionTitle ?? "Asignación") : (SECTION_LABELS[a.sectionType] ?? a.sectionType);
		slots.push({ key: `${a.id}:main`, label, userId: a.mainAssigneeId });
		slots.push({ key: `${a.id}:assistant`, label: `${label} (ayudante)`, userId: a.assistantAssigneeId });
	}
	opAssignments.forEach((o, i) => slots.push({ key: `op:${i}`, label: o.label, userId: o.userId }));
	function warningFor(key: string, userId: string | null): string | null {
		if (!userId) return null;
		const others = slots.filter((s) => s.key !== key && s.userId === userId).map((s) => s.label);
		return others.length ? `Ya está asignado este día como: ${[...new Set(others)].join(", ")}.` : null;
	}

	const groups: Record<(typeof GROUP_ORDER)[number], Assignment[]> = { treasures: [], ministry: [], living: [] };
	// La oración es una tarea fija que se asigna en "Datos de la reunión", no en un bloque de la guía.
	const prayerRow = assignments.find((a) => a.sectionType === "prayer") ?? null;
	for (const row of assignments) {
		if (row.sectionType === "prayer") continue;
		const group = SECTION_GROUP_BY_TYPE[row.sectionType] ?? "living";
		groups[group].push(row);
	}
	const livingCount = groups.living.length;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-display text-[22px] font-medium leading-tight text-ink">{formatLongDate(meeting.meetingDate)}</h2>
				<div className="flex flex-wrap items-center gap-1">
					{sendMessage && <span className="text-xs text-ink-soft">{sendMessage}</span>}
					<AutoAssignButton module="midweek" meetingId={meetingId} onApply={applyAutoAssign} disabled={dirty} />
					<IconButton label="Ver notificaciones S-89" icon={FileText} href={`/meetings/midweek/${meetingId}/notify`} />
					<SendAssignmentsButton endpoint={`/api/midweek/${meetingId}/notify`} onMessage={setSendMessage} />
					<Button onClick={handleSave} disabled={!dirty || saving}>
						<Save size={16} />
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>

			<section>
				<SectionLabel>Datos de la reunión</SectionLabel>
				<Card>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<BrotherSelector
							label="Presidente"
							value={meeting.chairmanUserId}
							options={eligibleByPrivilege[PRIVILEGE_IDS.MIDWEEK_CHAIRMAN] ?? []}
							warning={warningFor("chairman", meeting.chairmanUserId)}
							onChange={(userId) => patchMeeting({ chairmanUserId: userId })}
						/>
						{!skipOpeningPrayer && (
							<BrotherSelector
								label="Oración inicial"
								value={meeting.openingPrayerUserId}
								options={eligibleByPrivilege[PRIVILEGE_IDS.CONGREGATION_PRAYER] ?? []}
								warning={warningFor("openingPrayer", meeting.openingPrayerUserId)}
								onChange={(userId) => patchMeeting({ openingPrayerUserId: userId })}
							/>
						)}
						{prayerRow && (
							<BrotherSelector
								label="Oración final"
								value={prayerRow.mainAssigneeId}
								options={eligibleByPrivilege[PRIVILEGE_IDS.CONGREGATION_PRAYER] ?? []}
								warning={warningFor(`${prayerRow.id}:main`, prayerRow.mainAssigneeId)}
								onChange={(userId) => patchAssignment(prayerRow.id, { mainAssigneeId: userId })}
							/>
						)}
						<Select
							label="Estado"
							value={meeting.status}
							onChange={(e) => patchMeeting({ status: e.target.value as Meeting["status"] })}
						>
							<option value="scheduled">Programada</option>
							<option value="cancelled_assembly">Cancelada (asamblea)</option>
							<option value="cancelled_memorial">Cancelada (conmemoración)</option>
							<option value="adjusted_co_visit">Ajustada (visita SC)</option>
						</Select>
						<label className="flex min-h-12 items-center gap-2 self-end text-sm text-ink">
							<input
								type="checkbox"
								checked={meeting.hasAuxRoom}
								onChange={(e) => patchMeeting({ hasAuxRoom: e.target.checked })}
							/>
							Usar sala auxiliar (S-38 párr. 27)
						</label>
					</div>
				</Card>
			</section>

			{/* Cada canción va en su lugar del programa: inicial antes de Tesoros, intermedia en Nuestra vida cristiana y final al cierre. */}
			<Card>
				<SongSelect label="Canción" value={meeting.openingSongNumber} onChange={(n) => patchMeeting({ openingSongNumber: n })} />
			</Card>

			{GROUP_ORDER.map((group) => {
				const rows = groups[group];
				// "Seamos mejores maestros" se muestra aunque no tenga partes, porque
				// el botón para agregar una asignación estudiantil vive ahí.
				if (rows.length === 0 && group !== "ministry") return null;
				const style = GROUP_STYLES[group];
				return (
					<section key={group}>
						<div className={`mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider ${style.header}`}>
							<span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden="true" />
							{SECTION_GROUP_LABELS[group]}
						</div>
						{group === "living" && (
							<div className="mb-2">
								<SongSelect label="Canción" value={meeting.middleSongNumber} onChange={(n) => patchMeeting({ middleSongNumber: n })} />
							</div>
						)}
						<List>
							{rows.map((row) => {
								// Estudio bíblico de la congregación: una sola fila con Conductor y Lector.
								if (row.sectionType === "cbs") {
									const cbsRows = rows.filter((r) => r.sectionType === "cbs");
									if (cbsRows[0].id !== row.id) return null;
									const conductor = cbsRows.find((r) => r.sectionTitle === "Conductor") ?? cbsRows[0];
									const reader = cbsRows.find((r) => r.sectionTitle === "Lector") ?? cbsRows[1];
									const cbsParts = [{ part: conductor, label: "Conductor" }, ...(reader ? [{ part: reader, label: "Lector" }] : [])];
									return (
										<div key={row.id} className="flex flex-col gap-3 px-4 py-4">
											<p className="text-base font-semibold text-ink">
												{conductor.partNumber ? `${conductor.partNumber}. ` : ""}
												{SECTION_LABELS.cbs}
												{conductor.durationMinutes ? (
													<span className="ml-1.5 text-[13px] font-normal text-ink-soft">({conductor.durationMinutes} mins.)</span>
												) : null}
											</p>
											<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
												{cbsParts.map(({ part, label }) => (
													<BrotherSelector
														key={part.id}
														label={label}
														value={part.mainAssigneeId}
														options={part.privilegeId ? (eligibleByPrivilege[part.privilegeId] ?? []) : []}
														warning={warningFor(`${part.id}:main`, part.mainAssigneeId)}
														onChange={(userId) => patchAssignment(part.id, { mainAssigneeId: userId })}
													/>
												))}
											</div>
											{cbsParts.map(({ part }) =>
												rowError[part.id] ? (
													<p key={part.id} className="text-xs text-red-600">
														{rowError[part.id]}
													</p>
												) : null,
											)}
										</div>
									);
								}

								const isStudentPart = row.sectionType === "student_assignment";
								const isRemovable = REMOVABLE_SECTION_TYPES.includes(row.sectionType);
								const rule = isStudentPart ? getStudentPartRule(row.sectionTitle) : null;
								const baseOptions = row.privilegeId ? (eligibleByPrivilege[row.privilegeId] ?? []) : [];
								const options = rule?.requiresMale ? baseOptions.filter((o) => o.gender === "male") : baseOptions;
								const showTitleSelect = isStudentPart && (!row.sectionTitle || editingTitleId === row.id);

								return (
									<div key={row.id} className="flex flex-col gap-3 px-4 py-4">
										<div className="flex items-start justify-between gap-2">
											<p className="min-w-0 text-base font-semibold text-ink">
												{row.partNumber ? `${row.partNumber}. ` : ""}
												{headerLabel(row)}
												{!titleIsHeader(row) && row.sectionTitle && (
													<span className="ml-1.5 text-[13px] font-normal text-ink-soft">— {row.sectionTitle}</span>
												)}
												{row.durationMinutes ? (
													<span className="ml-1.5 text-[13px] font-normal text-ink-soft">({row.durationMinutes} mins.)</span>
												) : null}
												{isStudentPart && row.sectionTitle && !showTitleSelect && (
													<button
														type="button"
														onClick={() => setEditingTitleId(row.id)}
														className="ml-2 text-[13px] font-medium text-accent hover:underline"
													>
														Cambiar
													</button>
												)}
											</p>
											{isRemovable && (
												<div className="-my-2 -mr-2">
													<IconButton label="Quitar asignación" icon={Trash2} tone="danger" onClick={() => removeAssignment(row.id)} />
												</div>
											)}
										</div>

										{row.description && (
											<div className="text-sm text-ink-soft">
												{row.description.split("\n\n").map((paragraph, i) => (
													<p key={i} className={i > 0 ? "mt-1.5" : undefined}>
														{paragraph}
													</p>
												))}
											</div>
										)}

										{showTitleSelect && (
											<Select
												label="Tipo de asignación"
												value={row.sectionTitle ?? ""}
												onChange={(e) => patchAssignment(row.id, { sectionTitle: e.target.value || null })}
											>
												<option value="">Selecciona el tipo de asignación</option>
												{STUDENT_PART_TITLES.map((title) => (
													<option key={title} value={title}>
														{title}
													</option>
												))}
											</Select>
										)}

										<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
											<BrotherSelector
												label="Asignado"
												value={row.mainAssigneeId}
												options={options}
												warning={warningFor(`${row.id}:main`, row.mainAssigneeId)}
												onChange={(userId) => patchAssignment(row.id, { mainAssigneeId: userId })}
											/>
											{isStudentPart && rule?.hasHelper && (
												<BrotherSelector
													label="Ayudante"
													value={row.assistantAssigneeId}
													options={options}
													excludeUserId={row.mainAssigneeId}
													warning={warningFor(`${row.id}:assistant`, row.assistantAssigneeId)}
													onChange={(userId) => patchAssignment(row.id, { assistantAssigneeId: userId })}
												/>
											)}
											{/* La sala auxiliar solo aplica a la lectura de la Biblia y a las partes de estudiante. */}
											{meeting.hasAuxRoom && (isStudentPart || row.sectionType === "bible_reading") && (
												<Select
													label="Sala"
													value={row.room}
													onChange={(e) => patchAssignment(row.id, { room: e.target.value })}
												>
													<option value="main">Principal</option>
													<option value="auxiliary">Auxiliar</option>
												</Select>
											)}
										</div>
										{rowError[row.id] && <p className="text-xs text-red-600">{rowError[row.id]}</p>}
									</div>
								);
							})}
							{group === "ministry" && (
								<button
									type="button"
									onClick={addStudentPart}
									className={`flex min-h-12 w-full items-center gap-2 px-4 text-sm font-semibold hover:opacity-80 ${style.header} ${style.soft}`}
								>
									<Plus size={16} />
									Agregar asignación estudiantil
								</button>
							)}
							{group === "living" && (
								<button
									type="button"
									onClick={() => setCustomModalOpen(true)}
									className={`flex min-h-12 w-full items-center gap-2 px-4 text-sm font-semibold hover:opacity-80 ${style.header} ${style.soft}`}
								>
									<Plus size={16} />
									Agregar asignación personalizada
								</button>
							)}
						</List>
					</section>
				);
			})}

			<Card>
				<SongSelect label="Canción" value={meeting.closingSongNumber} onChange={(n) => patchMeeting({ closingSongNumber: n })} />
			</Card>

			<Modal open={customModalOpen} onClose={() => setCustomModalOpen(false)} title="Asignación personalizada">
				<div className="flex flex-col gap-3">
					<Input
						label="Título de la asignación"
						value={customTitle}
						onChange={(e) => setCustomTitle(e.target.value)}
						required
					/>
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-ink">Instrucciones (opcional)</span>
						<textarea
							value={customDescription}
							onChange={(e) => setCustomDescription(e.target.value)}
							rows={3}
							className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
						/>
					</label>
					<Select label="Posición dentro de Nuestra vida cristiana" value={customPosition} onChange={(e) => setCustomPosition(e.target.value)}>
						<option value="">Al final</option>
						{Array.from({ length: livingCount + 1 }, (_, i) => i + 1).map((pos) => (
							<option key={pos} value={pos}>
								{pos}ª
							</option>
						))}
					</Select>
					<Button onClick={addCustomLivingPart} disabled={!customTitle} className="mt-2">
						Agregar
					</Button>
				</div>
			</Modal>
		</div>
	);
}
