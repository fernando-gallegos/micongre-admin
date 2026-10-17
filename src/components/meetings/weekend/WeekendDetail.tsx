"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, TowerControl, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { BrotherSelector } from "@/components/shared/BrotherSelector";
import { SendAssignmentsButton } from "@/components/shared/SendAssignmentsButton";
import { SongSelect, useSongTitles } from "@/components/shared/SongSelect";
import { CopyMessageButton } from "./CopyMessageButton";
import { AutoAssignButton } from "@/components/assignments/AutoAssignButton";
import { songLabel } from "@/lib/songs/label";
import { SpeakerPicker, type AssignableSpeaker, type OutlineOption } from "./SpeakerPicker";
import { formatLongDate } from "@/lib/dateFormat";
import type { EligibleUser } from "@/lib/rbac/eligibility";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { PageLoader } from "@/components/ui/Spinner";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

interface Meeting {
	id: string;
	meetingDate: string;
	chairmanUserId: string | null;
	speakerId: string | null;
	talkOutlineId: string | null;
	watchtowerConductorId: string | null;
	watchtowerReaderId: string | null;
	prayerUserId: string | null;
	watchtowerFirst: boolean;
	watchtowerTitle: string | null;
	watchtowerSongNumber: number | null;
	closingSongNumber: number | null;
	status: string;
	notes: string | null;
}

const ALL_PRIVILEGE_IDS = [
	PRIVILEGE_IDS.WEEKEND_CHAIRMAN,
	PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR,
	PRIVILEGE_IDS.WATCHTOWER_READER,
	PRIVILEGE_IDS.CONGREGATION_PRAYER,
];

export function WeekendDetail({ meetingId }: { meetingId: string }) {
	const songTitles = useSongTitles();
	const [saved, setSaved] = useState<Meeting | null>(null);
	// Cambios sin guardar: se envían todos juntos con el botón "Guardar".
	const [draft, setDraft] = useState<Partial<Meeting>>({});
	const [saving, setSaving] = useState(false);
	const [sendMessage, setSendMessage] = useState<string | null>(null);
	// Tareas operativas ya guardadas de esta reunión (solo para los avisos de doble asignación).
	const [opAssignments, setOpAssignments] = useState<{ userId: string; label: string }[]>([]);
	const [eligibleByPrivilege, setEligibleByPrivilege] = useState<Record<string, EligibleUser[]>>({});
	const [speakers, setSpeakers] = useState<AssignableSpeaker[]>([]);
	const [outlinesById, setOutlinesById] = useState<Record<string, OutlineOption>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		const [detailRes, eligibleRes, speakersRes, outlinesRes, opRes] = await Promise.all([
			fetch(`/api/weekend/${meetingId}`),
			fetch(`/api/privileges/eligible?privilegeIds=${ALL_PRIVILEGE_IDS.join(",")}`),
			fetch(`/api/weekend/speakers?forAssignment=true`),
			fetch(`/api/weekend/outlines`),
			fetch(`/api/operational/assignments?meetingType=weekend&meetingId=${meetingId}`),
		]);
		if (opRes.ok) setOpAssignments(((await opRes.json()) as { items: { userId: string; label: string }[] }).items);
		if (detailRes.ok) {
			const body = (await detailRes.json()) as { meeting: Meeting };
			setSaved(body.meeting);
		}
		if (eligibleRes.ok) {
			setEligibleByPrivilege(await eligibleRes.json());
		}
		if (speakersRes.ok) {
			const body = (await speakersRes.json()) as { items: AssignableSpeaker[] };
			setSpeakers(body.items);
		}
		if (outlinesRes.ok) {
			const body = (await outlinesRes.json()) as { items: OutlineOption[] };
			setOutlinesById(Object.fromEntries(body.items.map((o) => [o.id, o])));
		}
		setLoading(false);
	}, [meetingId]);

	useEffect(() => {
		load();
	}, [load]);

	function patch(patchBody: Partial<Meeting>) {
		setDraft((d) => ({ ...d, ...patchBody }));
	}

	/** Vuelca la propuesta de «Asignar automáticamente» al borrador; se guarda con «Guardar». */
	function applyAutoAssign(picks: Record<string, string>) {
		const fields: Record<string, keyof Meeting> = {
			chairman: "chairmanUserId",
			prayer: "prayerUserId",
			watchtowerConductor: "watchtowerConductorId",
			watchtowerReader: "watchtowerReaderId",
		};
		const next: Partial<Meeting> = {};
		for (const [key, userId] of Object.entries(picks)) if (fields[key]) (next as Record<string, unknown>)[fields[key]] = userId;
		patch(next);
	}

	async function handleSave() {
		setError(null);
		setSaving(true);
		const response = await fetch(`/api/weekend/${meetingId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(draft),
		});
		setSaving(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			setError(body.error ?? "No se pudo guardar.");
			return;
		}
		setDraft({});
		load();
	}

	useUnsavedChanges(Object.keys(draft).length > 0);

	if (!saved) {
		return <PageLoader />;
	}
	const meeting: Meeting = { ...saved, ...draft };
	const dirty = Object.keys(draft).length > 0;

	// Aviso no bloqueante: la persona ya tiene otro rol en esta misma reunión.
	const speakerUserId = speakers.find((s) => s.id === meeting.speakerId)?.userId ?? null;
	const talkSong = (meeting.speakerId && meeting.talkOutlineId ? speakers.find((s) => s.id === meeting.speakerId)?.outlineSongs?.[meeting.talkOutlineId] : null) ?? null;
	const roleHolders: [string, string | null][] = [
		["Presidente", meeting.chairmanUserId],
		["Conductor de La Atalaya", meeting.watchtowerConductorId],
		["Lector de La Atalaya", meeting.watchtowerReaderId],
		["Orador", speakerUserId],
		["Oración", meeting.prayerUserId],
		...opAssignments.map((o): [string, string | null] => [o.label, o.userId]),
	];
	function warningFor(role: string, userId: string | null): string | null {
		if (!userId) return null;
		const others = [...new Set(roleHolders.filter(([r, id]) => r !== role && id === userId).map(([r]) => r))];
		return others.length ? `Ya está asignado este día como: ${others.join(", ")}.` : null;
	}

	return (
		<Card className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<h2 className="font-display text-[22px] font-medium leading-tight text-ink">{formatLongDate(meeting.meetingDate)}</h2>
				</div>
				<div className="flex flex-wrap items-center gap-1">
					{sendMessage && <span className="text-xs text-ink-soft">{sendMessage}</span>}
					<AutoAssignButton module="weekend" meetingId={meetingId} onApply={applyAutoAssign} disabled={dirty} />
					<SendAssignmentsButton endpoint={`/api/weekend/${meetingId}/notify`} onMessage={setSendMessage} />
					<Button onClick={handleSave} disabled={!dirty || saving}>
						<Save size={16} />
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}

			<div className="order-1 flex flex-col gap-3 border-t border-border pt-4">
				<h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Presidencia</h3>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<BrotherSelector
						label="Presidente"
						value={meeting.chairmanUserId}
						options={eligibleByPrivilege[PRIVILEGE_IDS.WEEKEND_CHAIRMAN] ?? []}
						warning={warningFor("Presidente", meeting.chairmanUserId)}
						onChange={(userId) => patch({ chairmanUserId: userId })}
					/>
					<BrotherSelector
						label="Oración"
						value={meeting.prayerUserId}
						options={eligibleByPrivilege[PRIVILEGE_IDS.CONGREGATION_PRAYER] ?? []}
						warning={warningFor("Oración", meeting.prayerUserId)}
						onChange={(userId) => patch({ prayerUserId: userId })}
					/>
					<Select
						label="Estado"
						value={meeting.status}
						onChange={(e) => patch({ status: e.target.value })}
					>
						<option value="scheduled">Programada</option>
						<option value="cancelled">Cancelada</option>
					</Select>
					<label className="flex min-h-12 items-center gap-2 self-end text-sm text-ink">
						<input type="checkbox" checked={meeting.watchtowerFirst} onChange={(e) => patch({ watchtowerFirst: e.target.checked })} />
						Iniciar con La Atalaya
					</label>
				</div>
			</div>

			<div className={`flex flex-col gap-3 border-t border-border pt-4 ${meeting.watchtowerFirst ? "order-2" : "order-3"}`}>
				<h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-weekend-watchtower">
					<TowerControl size={16} />
					La Atalaya
				</h3>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<BrotherSelector
						label="Conductor de La Atalaya"
						value={meeting.watchtowerConductorId}
						options={eligibleByPrivilege[PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR] ?? []}
						warning={warningFor("Conductor de La Atalaya", meeting.watchtowerConductorId)}
						onChange={(userId) => patch({ watchtowerConductorId: userId })}
					/>
					<BrotherSelector
						label="Lector de La Atalaya"
						value={meeting.watchtowerReaderId}
						options={eligibleByPrivilege[PRIVILEGE_IDS.WATCHTOWER_READER] ?? []}
						warning={warningFor("Lector de La Atalaya", meeting.watchtowerReaderId)}
						onChange={(userId) => patch({ watchtowerReaderId: userId })}
					/>
					<div className="md:col-span-2">
						<Input
							label="Título del estudio"
							value={meeting.watchtowerTitle ?? ""}
							onChange={(e) => patch({ watchtowerTitle: e.target.value || null })}
							placeholder="Se trae de JW.ORG con el botón de descargar"
						/>
					</div>
					<SongSelect label="Canción al empezar La Atalaya" value={meeting.watchtowerSongNumber} onChange={(n) => patch({ watchtowerSongNumber: n })} />
					<SongSelect label="Canción al terminar La Atalaya" value={meeting.closingSongNumber} onChange={(n) => patch({ closingSongNumber: n })} />
				</div>
			</div>

			<div className={`flex flex-col gap-3 border-t border-border pt-4 ${meeting.watchtowerFirst ? "order-3" : "order-2"}`}>
				<h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-weekend-talk">
					<UserRound size={16} />
					Discurso público
				</h3>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<SpeakerPicker
						speakerId={meeting.speakerId}
						talkOutlineId={meeting.talkOutlineId}
						speakers={speakers}
						outlinesById={outlinesById}
						speakerWarning={warningFor("Orador", speakerUserId)}
						onChangeSpeaker={(speakerId) => patch({ speakerId })}
						onChangeOutline={(talkOutlineId) => patch({ talkOutlineId })}
					/>
				</div>
				{meeting.speakerId && speakers.find((s) => s.id === meeting.speakerId)?.kind === "visiting" && (
					<div className="flex items-center gap-2 text-sm text-ink-soft">
						<CopyMessageButton kind="incoming" id={meetingId} disabled={dirty} />
						{dirty ? "Guarda los cambios para copiar el mensaje del orador invitado." : "Copiar mensaje para el orador invitado"}
					</div>
				)}
				{talkSong != null && (
					<p className="text-sm text-ink-soft">
						Canción del discurso (la del orador para este bosquejo; va {meeting.watchtowerFirst ? "al terminar el discurso" : "al empezar la reunión"}): {songLabel(talkSong, songTitles)}
					</p>
				)}
			</div>

			<div className="order-4 border-t border-border pt-4">
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-ink">Notas</span>
					<textarea
						value={meeting.notes ?? ""}
						onChange={(e) => patch({ notes: e.target.value })}
						rows={3}
						className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
					/>
				</label>
			</div>
		</Card>
	);
}
