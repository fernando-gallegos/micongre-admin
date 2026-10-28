"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton, List, SectionLabel } from "@/components/ui/Layout";
import { Input, Select } from "@/components/ui/Input";
import type { EligibleUser } from "@/lib/rbac/eligibility";
import { NON_MEETING_OPERATIONAL_IDS, PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { TaskCell, type OperationalSlot } from "./TaskCell";
import { AutoAssignButton } from "@/components/assignments/AutoAssignButton";
import { PageLoader } from "@/components/ui/Spinner";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

// Las tareas se agrupan en 2 bloques: audio y video (consola y Zoom), y
// acomodadores (todo lo demás: entrada, auditorio, estacionamiento, baños,
// micrófonos, plataforma…).
const AUDIO_VIDEO_PRIVILEGES: string[] = [PRIVILEGE_IDS.AUDIO_CONSOLE, PRIVILEGE_IDS.VIDEO_ZOOM];

interface PrivilegeOption {
	id: string;
	name: string;
}

export function WeeklyMatrix({
	meetingType,
	meetingId,
}: {
	meetingType: "midweek" | "weekend";
	meetingId: string;
}) {
	const [slots, setSlots] = useState<OperationalSlot[]>([]);
	const [catalog, setCatalog] = useState<PrivilegeOption[]>([]);
	const [eligibleByPrivilege, setEligibleByPrivilege] = useState<Record<string, EligibleUser[]>>({});
	const [loading, setLoading] = useState(true);
	const [newPrivilegeId, setNewPrivilegeId] = useState("");
	const [newPosition, setNewPosition] = useState("");
	const [sending, setSending] = useState(false);
	const [sentMessage, setSentMessage] = useState<string | null>(null);
	// Asignaciones sin guardar (slotId → persona); se envían juntas con "Guardar".
	const [drafts, setDrafts] = useState<Record<string, string | null>>({});
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	// Asignaciones del programa de la reunión, para los avisos de doble asignación.
	const [program, setProgram] = useState<{ userId: string; label: string }[]>([]);

	const load = useCallback(async () => {
		setLoading(true);
		const [slotsRes, catalogRes, programRes] = await Promise.all([
			fetch(`/api/operational?meetingType=${meetingType}&meetingId=${meetingId}`),
			fetch("/api/privileges?category=operational"),
			fetch(`/api/operational/assignments?meetingType=${meetingType}&meetingId=${meetingId}`),
		]);
		if (programRes.ok) {
			setProgram(((await programRes.json()) as { program: { userId: string; label: string }[] }).program);
		}

		let loadedSlots: OperationalSlot[] = [];
		if (slotsRes.ok) {
			loadedSlots = ((await slotsRes.json()) as { items: OperationalSlot[] }).items;
			setSlots(loadedSlots);
		}
		let loadedCatalog: PrivilegeOption[] = [];
		if (catalogRes.ok) {
			// "Tareas operativas" es el privilegio de acceso al módulo, no una
			// tarea asignable — no tiene sentido ofrecerlo aquí.
			loadedCatalog = ((await catalogRes.json()) as { items: PrivilegeOption[] }).items.filter(
				(c) => !NON_MEETING_OPERATIONAL_IDS.includes(c.id),
			);
			setCatalog(loadedCatalog);
			setNewPrivilegeId((current) => current || loadedCatalog[0]?.id || "");
		}

		const idsToFetch = Array.from(
			new Set([...loadedSlots.map((s) => s.privilegeId), ...loadedCatalog.map((c) => c.id)]),
		);
		if (idsToFetch.length > 0) {
			const eligibleRes = await fetch(`/api/privileges/eligible?privilegeIds=${idsToFetch.join(",")}`);
			if (eligibleRes.ok) setEligibleByPrivilege((await eligibleRes.json()) as Record<string, EligibleUser[]>);
		}

		setLoading(false);
	}, [meetingType, meetingId]);

	useEffect(() => {
		load();
	}, [load]);

	async function addTask() {
		if (!newPrivilegeId) return;
		await fetch("/api/operational", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingType, meetingId, privilegeId: newPrivilegeId, position: newPosition || null }),
		});
		setNewPosition("");
		load();
	}

	function assignSlot(slotId: string, userId: string | null) {
		setDrafts((d) => ({ ...d, [slotId]: userId }));
	}

	async function saveAll() {
		setSaving(true);
		setSaveError(null);
		const remaining: Record<string, string | null> = {};
		for (const [slotId, userId] of Object.entries(drafts)) {
			if (!slots.some((s) => s.id === slotId)) continue;
			const response = await fetch(`/api/operational/${slotId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ assignedUserId: userId }),
			});
			if (!response.ok) remaining[slotId] = userId;
		}
		setDrafts(remaining);
		if (Object.keys(remaining).length > 0) setSaveError("No se pudieron guardar algunas asignaciones.");
		setSaving(false);
		load();
	}

	async function removeSlot(slotId: string) {
		await fetch(`/api/operational/${slotId}`, { method: "DELETE" });
		load();
	}

	async function sendReminders() {
		setSending(true);
		setSentMessage(null);
		const response = await fetch("/api/operational/notify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ meetingType, meetingId }),
		});
		if (response.ok) {
			const body = (await response.json()) as { sent: number };
			setSentMessage(
				body.sent === 0
					? "Todavía no hay nadie asignado en esta reunión."
					: `Aviso enviado a ${body.sent} publicador(es).`,
			);
		} else {
			setSentMessage("No se pudo enviar el aviso.");
		}
		setSending(false);
	}

	useUnsavedChanges(Object.keys(drafts).length > 0);

	if (loading && slots.length === 0) return <PageLoader />;

	const assignedCount = slots.filter((s) => s.assignedUserId).length;
	const dirty = Object.keys(drafts).length > 0;
	const shownUserId = (slot: OperationalSlot) => (slot.id in drafts ? drafts[slot.id] : slot.assignedUserId);
	// Aviso no bloqueante: la persona ya tiene otra asignación en esta reunión.
	function warningsFor(slot: OperationalSlot): string[] {
		const userId = shownUserId(slot);
		if (!userId) return [];
		const labels = [
			...program.filter((p) => p.userId === userId).map((p) => p.label),
			...slots
				.filter((s) => s.id !== slot.id && shownUserId(s) === userId)
				.map((s) => s.position || s.privilegeName),
		];
		return labels.length ? [`Ya está asignado este día como: ${[...new Set(labels)].join(", ")}.`] : [];
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center justify-end gap-2">
				{sentMessage && <span className="mr-auto text-xs text-ink-soft">{sentMessage}</span>}
				<AutoAssignButton
					module={meetingType === "midweek" ? "operational-midweek" : "operational-weekend"}
					meetingId={meetingId}
					onApply={(picks) => {
						for (const [key, userId] of Object.entries(picks)) if (key.startsWith("o:")) assignSlot(key.slice(2), userId);
					}}
					disabled={dirty}
				/>
				<Button onClick={saveAll} disabled={!dirty || saving}>
					<Save size={16} />
					{saving ? "Guardando..." : "Guardar"}
				</Button>
				<IconButton
					label={sending ? "Enviando..." : "Enviar avisos a los asignados"}
					icon={Send}
					onClick={sendReminders}
					disabled={sending || assignedCount === 0}
					tone="accent"
				/>
			</div>

			{saveError && <p className="text-sm text-warn">{saveError}</p>}

			{slots.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">Todavía no hay tareas agregadas para esta reunión.</p>
				</Card>
			)}

			{[
				{
					key: "ushers",
					title: "Acomodadores",
					items: slots.filter((s) => !AUDIO_VIDEO_PRIVILEGES.includes(s.privilegeId)),
				},
				{
					key: "audio-video",
					title: "Audio / Video",
					items: slots.filter((s) => AUDIO_VIDEO_PRIVILEGES.includes(s.privilegeId)),
				},
			].map(
				(group) =>
					group.items.length > 0 && (
						<section key={group.key}>
							<SectionLabel>{group.title}</SectionLabel>
							<List>
								{group.items.map((slot) => (
									<TaskCell
										key={slot.id}
										slot={{ ...slot, assignedUserId: shownUserId(slot), warnings: warningsFor(slot) }}
										options={eligibleByPrivilege[slot.privilegeId] ?? []}
										onAssign={(userId) => assignSlot(slot.id, userId)}
										onRemove={() => removeSlot(slot.id)}
									/>
								))}
							</List>
						</section>
					),
			)}

			<section>
				<SectionLabel>Agregar una asignación solo a esta reunión</SectionLabel>
				<Card>
					<p className="mb-3 text-xs text-ink-soft">
						Las asignaciones de cada reunión salen de la pestaña «Plantilla». Si la que agregas aquí queda sin nadie, el job
						diario la quita para dejar la reunión igual que la plantilla.
					</p>
					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
						<Select label="Privilegio" value={newPrivilegeId} onChange={(e) => setNewPrivilegeId(e.target.value)}>
							{catalog.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</Select>
						<Input
							label="Nombre (opcional)"
							placeholder='p. ej. "Puerta izquierda"'
							value={newPosition}
							onChange={(e) => setNewPosition(e.target.value)}
						/>
						<Button onClick={addTask} disabled={!newPrivilegeId} variant="secondary">
							<Plus size={16} />
							Agregar
						</Button>
					</div>
				</Card>
			</section>
		</div>
	);
}
