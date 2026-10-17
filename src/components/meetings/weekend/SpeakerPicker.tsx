"use client";

import { Select } from "@/components/ui/Input";

export interface AssignableSpeaker {
	id: string;
	kind: "local" | "visiting";
	userId?: string | null;
	fullName: string;
	congregationName: string | null;
	outlineIds: string[];
	/** Canción que el orador usa con cada bosquejo (id del bosquejo → número). */
	outlineSongs?: Record<string, number>;
}

export interface OutlineOption {
	id: string;
	number: number;
	title: string;
}

export function SpeakerPicker({
	speakerId,
	talkOutlineId,
	speakers,
	outlinesById,
	speakerWarning,
	onChangeSpeaker,
	onChangeOutline,
}: {
	speakerId: string | null;
	talkOutlineId: string | null;
	speakers: AssignableSpeaker[];
	outlinesById: Record<string, OutlineOption>;
	speakerWarning?: string | null;
	onChangeSpeaker: (speakerId: string | null) => void;
	onChangeOutline: (outlineId: string | null) => void;
}) {
	const speaker = speakers.find((s) => s.id === speakerId) ?? null;
	const outlineOptions = (speaker?.outlineIds ?? [])
		.map((id) => outlinesById[id])
		.filter((o): o is OutlineOption => !!o)
		.sort((a, b) => a.number - b.number);

	return (
		<>
			<Select
				label="Orador"
				value={speakerId ?? ""}
				onChange={(e) => onChangeSpeaker(e.target.value || null)}
			>
				<option value="">Sin asignar</option>
				{speakers.map((s) => (
					<option key={s.id} value={s.id}>
						{s.fullName}
						{s.kind === "visiting" && s.congregationName ? ` (${s.congregationName})` : ""}
					</option>
				))}
			</Select>

			{speaker && outlineOptions.length === 0 ? (
				<p className="flex items-center text-xs text-ink-soft">
					Este orador no tiene bosquejos registrados — agrégalos desde la pestaña Oradores.
				</p>
			) : (
				<Select
					label="Bosquejo"
					value={talkOutlineId ?? ""}
					disabled={!speaker}
					onChange={(e) => onChangeOutline(e.target.value || null)}
				>
					<option value="">{speaker ? "Sin asignar" : "Selecciona un orador primero"}</option>
					{outlineOptions.map((o) => (
						<option key={o.id} value={o.id}>
							{o.number}. {o.title}
						</option>
					))}
				</Select>
			)}
		</>
	);
}
