"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { AttendanceCounter, AttendanceWhatsApp } from "@/components/reports/AttendanceForm";
import { formatLongDate } from "@/lib/dateFormat";

/** La reunión que se ve (para registrar su asistencia). `date` = fecha real de la reunión. */
export interface AttendanceTarget {
	type: "midweek" | "weekend";
	id: string;
	date: string;
	label: string;
}

interface AttendanceItem {
	inPersonCount: number | null;
	zoomCount: number | null;
}

/**
 * Botón flotante para registrar la asistencia de la reunión que se ve: solo si el servidor dice que se puede (admin, registro de
 * asistencia, secretario o los acomodadores de entrada y de auditorio de esa reunión). Abre un diálogo ya lleno con lo registrado.
 * `bottomClass` lo coloca arriba del reloj o de la barra del cronómetro.
 */
export function MeetingAttendanceButton({ target, bottomClass }: { target: AttendanceTarget; bottomClass: string }) {
	const [data, setData] = useState<{ item: AttendanceItem | null; canRecord: boolean } | null>(null);
	const [open, setOpen] = useState(false);
	const [refresh, setRefresh] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setData(null);
		fetch(`/api/attendance?meetingType=${target.type}&meetingId=${encodeURIComponent(target.id)}`)
			.then((r) => (r.ok ? (r.json() as Promise<{ item?: AttendanceItem | null; canRecord?: boolean }>) : null))
			.then((json) => {
				if (!cancelled) setData(json ? { item: json.item ?? null, canRecord: !!json.canRecord } : null);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [target.type, target.id, refresh]);

	if (!data?.canRecord) return null;
	return (
		<>
			<Tooltip content="Registrar la asistencia">
				<button
					type="button"
					aria-label="Registrar la asistencia"
					onClick={() => setOpen(true)}
					className={`fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-lg shadow-black/20 ring-1 ring-border transition-opacity hover:opacity-90 md:right-8 print:hidden ${bottomClass}`}
				>
					<Users size={24} />
				</button>
			</Tooltip>
			{open && (
				<AttendanceDialog
					target={target}
					item={data.item}
					onClose={() => setOpen(false)}
					onSaved={() => {
						setOpen(false);
						setRefresh((n) => n + 1);
					}}
				/>
			)}
		</>
	);
}

function AttendanceDialog({
	target,
	item,
	onClose,
	onSaved,
}: {
	target: AttendanceTarget;
	item: AttendanceItem | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [inPerson, setInPerson] = useState(item?.inPersonCount != null ? String(item.inPersonCount) : "");
	const [zoom, setZoom] = useState(item?.zoomCount ? String(item.zoomCount) : "");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const total = (Number(inPerson) || 0) + (Number(zoom) || 0);

	async function save() {
		setSaving(true);
		setMessage(null);
		const response = await fetch("/api/attendance", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				meetingType: target.type,
				meetingId: target.id,
				meetingDate: target.date,
				inPersonCount: Number(inPerson) || 0,
				zoomCount: Number(zoom) || 0,
			}),
		}).catch(() => null);
		setSaving(false);
		if (response?.ok) onSaved();
		else setMessage("No se pudo guardar. Inténtalo de nuevo.");
	}

	return (
		<Modal open onClose={() => !saving && onClose()} title="Asistencia">
			<div className="flex flex-col items-center gap-6">
				<p className="text-sm text-ink-soft">
					{target.label} · {formatLongDate(target.date)}
				</p>
				<AttendanceCounter label="Presentes en el salón" size="lg" value={inPerson} onChange={setInPerson} />
				<AttendanceCounter label="Conectados por Zoom" size="md" value={zoom} onChange={setZoom} />
				<span className="rounded-full bg-accent-soft px-5 py-1.5 text-base font-semibold text-accent">Total: {total}</span>
				<AttendanceWhatsApp label={target.label} date={target.date} inPerson={inPerson} zoom={zoom} />
				{message && <p className="text-sm text-red-600">{message}</p>}
				<div className="flex w-full justify-end gap-2">
					<Button variant="secondary" onClick={onClose} disabled={saving}>
						Cancelar
					</Button>
					<Button onClick={save} disabled={saving || inPerson.trim() === ""}>
						{saving ? "Guardando…" : "Guardar"}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
