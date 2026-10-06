"use client";

import { useState } from "react";
import { CheckCircle2, Download, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { RESET_CONFIRMATION } from "@/lib/backup/constants";

type Phase = "idle" | "backup" | "wipe" | "done";

function backupFileName() {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `micongre-respaldo-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Da tiempo a que el navegador arranque la descarga antes de soltar el blob.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Zona de peligro (solo administradores): borra todos los datos de la
// congregación. Antes descarga sola un respaldo completo — si esa descarga
// falla, no se borra nada. El respaldo se puede volver a cargar desde el
// asistente de configuración inicial (paso "Origen de datos").
export function DeleteAllDataCard() {
	const [open, setOpen] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [phase, setPhase] = useState<Phase>("idle");
	const [error, setError] = useState<string | null>(null);

	const [downloading, setDownloading] = useState(false);
	const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

	// Respaldo suelto, sin borrar nada.
	async function downloadOnly() {
		setDownloading(true);
		setDownloadMessage(null);
		try {
			const response = await fetch("/api/congregation/backup");
			if (!response.ok) throw new Error("backup");
			const tables = response.headers.get("X-Backup-Tables");
			const rows = response.headers.get("X-Backup-Rows");
			downloadBlob(await response.blob(), backupFileName());
			setDownloadMessage(`Respaldo descargado: ${tables} tablas, ${rows} registros.`);
		} catch {
			setDownloadMessage("No se pudo generar el respaldo. Intenta de nuevo.");
		} finally {
			setDownloading(false);
		}
	}

	const busy = phase === "backup" || phase === "wipe";
	const confirmed = confirmText.trim() === RESET_CONFIRMATION;

	function close() {
		if (busy || phase === "done") return;
		setOpen(false);
		setConfirmText("");
		setError(null);
		setPhase("idle");
	}

	async function run() {
		setError(null);
		setPhase("backup");
		try {
			const backup = await fetch("/api/congregation/backup");
			if (!backup.ok) throw new Error("backup");
			downloadBlob(await backup.blob(), backupFileName());
		} catch {
			setPhase("idle");
			setError("No se pudo generar el respaldo, así que no se borró nada. Intenta de nuevo.");
			return;
		}

		setPhase("wipe");
		// Pausa breve para que el navegador inicie la descarga antes de borrar.
		await new Promise((r) => setTimeout(r, 1200));
		try {
			const res = await fetch("/api/congregation/reset", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirm: confirmText.trim() }),
			});
			if (!res.ok) throw new Error("reset");
		} catch {
			setPhase("idle");
			setError("El respaldo se descargó, pero no se pudo borrar. Intenta de nuevo.");
			return;
		}

		setPhase("done");
		// Sin administradores la app vuelve a ser "nueva": el asistente de inicio.
		setTimeout(() => window.location.assign("/setup"), 1800);
	}

	return (
		<>
			<section>
				<SectionLabel>Zona de peligro</SectionLabel>
				<Card className="flex flex-col gap-3">
					<p className="text-sm leading-relaxed text-ink-soft">
						Descarga un respaldo completo (territorios y mapas incluidos) que puedes volver a cargar desde el asistente de
						inicio, o borra todos los datos y deja la aplicación como nueva (antes se descarga un respaldo).
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="secondary" onClick={downloadOnly} disabled={downloading} title="Descarga todos los datos de la aplicación (territorios y mapas incluidos) en un archivo que se puede restaurar desde el asistente de inicio">
							{downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
							Descargar respaldo
						</Button>
						<Button
							variant="secondary"
							className="!border-red-300 !text-red-700 hover:!bg-red-50"
							onClick={() => setOpen(true)}
							title="Borra todos los datos de la aplicación (antes descarga un respaldo)"
						>
							<Trash2 size={18} />
							Borrar todo
						</Button>
					</div>
					{downloadMessage && <p className="text-sm text-ink-soft">{downloadMessage}</p>}
				</Card>
			</section>

			<Modal open={open} onClose={close} title="Borrar todos los datos">
				{phase === "done" ? (
					<div className="flex flex-col items-center gap-3 py-4 text-center">
						<CheckCircle2 size={32} className="text-accent" />
						<p className="text-sm text-ink">Datos borrados. Llevándote al asistente de inicio…</p>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
							<TriangleAlert size={16} className="mt-0.5 shrink-0" />
							<span>
								Esto elimina todo, incluidas las cuentas de acceso (también la tuya). Se descargará un respaldo
								automáticamente antes de borrar; guárdalo en un lugar seguro, porque contiene datos personales y
								contraseñas cifradas.
							</span>
						</p>
						<Input
							label={`Escribe ${RESET_CONFIRMATION} para confirmar`}
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
							disabled={busy}
							autoComplete="off"
						/>
						{error && <p className="text-sm text-red-600">{error}</p>}
						{busy && (
							<p className="flex items-center gap-2 text-sm text-ink-soft">
								<Loader2 size={16} className="animate-spin" />
								{phase === "backup" ? "Generando y descargando el respaldo…" : "Borrando los datos…"}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<Button variant="ghost" onClick={close} disabled={busy}>
								Cancelar
							</Button>
							<Button variant="danger" onClick={run} disabled={!confirmed || busy}>
								Descargar respaldo y borrar todo
							</Button>
						</div>
					</div>
				)}
			</Modal>
		</>
	);
}
