"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { IconButton, List, ListRow } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { CongregationPicker, upsertCongregation, type Congregation } from "./CongregationPicker";
import { formatShortDate, formatTime12h } from "@/lib/dateFormat";
import { PageLoader } from "@/components/ui/Spinner";

interface OutgoingTalk {
	id: string;
	meetingDate: string;
	meetingTime: string;
	congregationId: string;
	congregationName: string;
	speakerId: string;
	speakerName: string;
	talkOutlineId: string;
	talkOutlineNumber: number;
	talkOutlineTitle: string;
}

interface LocalSpeaker {
	id: string;
	fullName: string;
	outlineIds: string[];
}

interface Outline {
	id: string;
	number: number;
	title: string;
}

export function OutgoingTalksList({ weekStart, weekEnd }: { weekStart: string; weekEnd: string }) {
	const [talks, setTalks] = useState<OutgoingTalk[]>([]);
	const [speakers, setSpeakers] = useState<LocalSpeaker[]>([]);
	const [congregations, setCongregations] = useState<Congregation[]>([]);
	const [outlines, setOutlines] = useState<Outline[]>([]);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<OutgoingTalk | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		const [talksRes, speakersRes, congregationsRes, outlinesRes] = await Promise.all([
			fetch(`/api/weekend/outgoing-talks?from=${weekStart}&to=${weekEnd}`),
			fetch("/api/weekend/speakers?forAssignment=true&kind=local"),
			fetch("/api/weekend/congregations"),
			fetch("/api/weekend/outlines"),
		]);
		if (talksRes.ok) setTalks(((await talksRes.json()) as { items: OutgoingTalk[] }).items);
		if (speakersRes.ok) setSpeakers(((await speakersRes.json()) as { items: LocalSpeaker[] }).items);
		if (congregationsRes.ok) setCongregations(((await congregationsRes.json()) as { items: Congregation[] }).items);
		if (outlinesRes.ok) setOutlines(((await outlinesRes.json()) as { items: Outline[] }).items);
		setLoading(false);
	}, [weekStart, weekEnd]);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<section>
			<div className="mb-1 flex items-center justify-between gap-2 px-1">
				<h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Discursos enviados a otras congregaciones</h2>
				<IconButton label="Agregar discurso enviado" icon={Plus} tone="accent" onClick={() => setModalOpen(true)} />
			</div>

			{loading && <PageLoader />}
			{!loading && talks.length === 0 && (
				<p className="px-1 text-sm text-ink-soft">No hay discursos enviados programados esta semana.</p>
			)}

			{talks.length > 0 && (
				<List>
					{talks.map((talk) => (
						<ListRow
							key={talk.id}
							onClick={() => setEditing(talk)}
							title={
								<span className="capitalize">
									{formatShortDate(talk.meetingDate)} · {formatTime12h(talk.meetingTime)}
								</span>
							}
							subtitle={`${talk.speakerName} → ${talk.congregationName} · ${talk.talkOutlineNumber}. ${talk.talkOutlineTitle}`}
						/>
					))}
				</List>
			)}

			<OutgoingTalkFormModal
				open={modalOpen}
				weekStart={weekStart}
				speakers={speakers}
				congregations={congregations}
				outlines={outlines}
				onClose={() => setModalOpen(false)}
				onSaved={() => {
					setModalOpen(false);
					load();
				}}
				onCongregationSaved={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
			/>

			{editing && (
				<OutgoingTalkFormModal
					open
					talk={editing}
					weekStart={weekStart}
					speakers={speakers}
					congregations={congregations}
					outlines={outlines}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						load();
					}}
					onDeleted={() => {
						setEditing(null);
						load();
					}}
					onCongregationSaved={(c) => setCongregations((prev) => upsertCongregation(prev, c))}
				/>
			)}
		</section>
	);
}

function OutgoingTalkFormModal({
	open,
	talk,
	weekStart,
	speakers,
	congregations,
	outlines,
	onClose,
	onSaved,
	onDeleted,
	onCongregationSaved,
}: {
	open: boolean;
	talk?: OutgoingTalk;
	weekStart: string;
	speakers: LocalSpeaker[];
	congregations: Congregation[];
	outlines: Outline[];
	onClose: () => void;
	onSaved: () => void;
	onDeleted?: () => void;
	onCongregationSaved: (c: Congregation) => void;
}) {
	const [meetingDate, setMeetingDate] = useState(talk?.meetingDate ?? weekStart);
	const [meetingTime, setMeetingTime] = useState(talk?.meetingTime ?? "");
	const [congregationId, setCongregationId] = useState(talk?.congregationId ?? "");
	const [speakerId, setSpeakerId] = useState(talk?.speakerId ?? "");
	const [talkOutlineId, setTalkOutlineId] = useState(talk?.talkOutlineId ?? "");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const speaker = speakers.find((s) => s.id === speakerId) ?? null;
	const outlineOptions = (speaker?.outlineIds ?? [])
		.map((id) => outlines.find((o) => o.id === id))
		.filter((o): o is Outline => !!o)
		.sort((a, b) => a.number - b.number);

	async function save() {
		setSaving(true);
		setError(null);
		const body = { meetingDate, meetingTime, congregationId, speakerId, talkOutlineId };
		const response = await fetch(talk ? `/api/weekend/outgoing-talks/${talk.id}` : "/api/weekend/outgoing-talks", {
			method: talk ? "PATCH" : "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar.");
			return;
		}
		onSaved();
	}

	async function remove() {
		if (!talk) return;
		setSaving(true);
		const response = await fetch(`/api/weekend/outgoing-talks/${talk.id}`, { method: "DELETE" });
		setSaving(false);
		if (!response.ok) {
			setError("No se pudo eliminar.");
			return;
		}
		onDeleted?.();
	}

	const canSave = meetingDate && meetingTime && congregationId && speakerId && talkOutlineId;

	return (
		<Modal open={open} onClose={onClose} title={talk ? "Editar discurso enviado" : "Agregar discurso enviado"}>
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-2 gap-3">
					<Input label="Fecha" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} required />
					<Input label="Hora" type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} required />
				</div>

				<CongregationPicker
					congregations={congregations}
					value={congregationId}
					onChange={(id) => {
						setCongregationId(id);
						// Al elegir la congregación se prellena la hora con su reunión del fin de semana.
						const time = congregations.find((c) => c.id === id)?.weekendMeetingTime;
						if (time) setMeetingTime(time.slice(0, 5));
					}}
					onCongregationSaved={onCongregationSaved}
					emptyLabel="Selecciona una congregación"
					allowCreate={false}
				/>

				<Select
					label="Orador"
					value={speakerId}
					onChange={(e) => {
						setSpeakerId(e.target.value);
						setTalkOutlineId("");
					}}
				>
					<option value="">Selecciona un orador local</option>
					{speakers.map((s) => (
						<option key={s.id} value={s.id}>
							{s.fullName}
						</option>
					))}
				</Select>

				{speaker && outlineOptions.length === 0 ? (
					<p className="text-xs text-ink-soft">Este orador no tiene bosquejos registrados — agrégalos en la pestaña Oradores.</p>
				) : (
					<Select
						label="Bosquejo"
						value={talkOutlineId}
						disabled={!speaker}
						onChange={(e) => setTalkOutlineId(e.target.value)}
					>
						<option value="">{speaker ? "Selecciona un bosquejo" : "Selecciona un orador primero"}</option>
						{outlineOptions.map((o) => (
							<option key={o.id} value={o.id}>
								{o.number}. {o.title}
							</option>
						))}
					</Select>
				)}

				{error && <p className="text-sm text-red-600">{error}</p>}
				<div className="flex gap-2">
					{talk && (
						<Button variant="danger" onClick={remove} disabled={saving}>
							<Trash2 size={15} />
							Eliminar
						</Button>
					)}
					<Button onClick={save} disabled={!canSave || saving} className="flex-1">
						{saving ? "Guardando..." : "Guardar"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
