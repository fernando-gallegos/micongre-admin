"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Layout";
import { downloadBlob, downloadReport, safeFileName } from "@/lib/export/download";
import { FORMAT_LABEL, type ExportFormat, type ReportDoc } from "@/lib/export/types";

export interface ExportVariant {
	label: string;
	/** Reporte distinto al del botón (p. ej. «ambas reuniones» dentro del botón de entre semana). */
	kind?: string;
	/** Parámetros que se suman a `params` al pedir el reporte (p. ej. scope=week | month). */
	params: Record<string, string>;
}

const ERRORS: Record<string, string> = {
	forbidden: "No tienes permiso para este reporte.",
	no_tables: "Este reporte no tiene tablas para Excel.",
};

/** Botón de ícono «Descargar reporte»: abre una hoja donde se elige la variante (p. ej. semana o mes)
 * y el formato (Imagen PNG, Word, Excel). El reporte se arma en el servidor (`/api/export/[kind]`)
 * con los permisos del usuario y se convierte aquí al formato elegido. */
export function ExportButton({
	kind,
	params = {},
	variants,
	formats = ["png", "docx"],
	title = "Descargar reporte",
	label = "Descargar reporte",
}: {
	kind: string;
	params?: Record<string, string>;
	variants?: ExportVariant[];
	formats?: ExportFormat[];
	/** Tooltip del ícono. */
	label?: string;
	/** Título de la hoja. */
	title?: string;
}) {
	const [open, setOpen] = useState(false);
	const [variant, setVariant] = useState(0);
	const [busy, setBusy] = useState<ExportFormat | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function run(format: ExportFormat) {
		setBusy(format);
		setError(null);
		try {
			const query = new URLSearchParams({ ...params, ...(variants?.[variant]?.params ?? {}) });
			const response = await fetch(`/api/export/${variants?.[variant]?.kind ?? kind}?${query.toString()}`);
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(response.status === 403 ? "forbidden" : (body?.error ?? "failed"));
			}
			const { doc } = (await response.json()) as { doc: ReportDoc };
			await downloadReport(doc, format);
			setOpen(false);
		} catch (e) {
			setError(ERRORS[(e as Error).message] ?? "No se pudo generar el reporte. Intenta de nuevo.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<>
			<IconButton label={label} icon={FileDown} onClick={() => setOpen(true)} />
			<Modal open={open} onClose={() => !busy && setOpen(false)} title={title}>
				<div className="flex flex-col gap-4">
					{variants && variants.length > 1 && (
						<ChipGroup>
							{variants.map((v, i) => (
								<Chip key={v.label} active={variant === i} onClick={() => setVariant(i)}>
									{v.label}
								</Chip>
							))}
						</ChipGroup>
					)}
					<div className="flex flex-col gap-2">
						{formats.map((f) => (
							<Button key={f} variant="secondary" className="justify-between" disabled={!!busy} onClick={() => run(f)}>
								{FORMAT_LABEL[f]}
								{busy === f && <Loader2 size={16} className="animate-spin" />}
							</Button>
						))}
					</div>
					{error && <p className="text-sm text-red-600">{error}</p>}
				</div>
			</Modal>
		</>
	);
}

/** Descargar como imagen un elemento que ya está en pantalla (p. ej. el cronograma de limpieza). */
export function ExportElementButton({
	getElement,
	fileName,
	label = "Descargar como imagen",
}: {
	getElement: () => HTMLElement | null;
	fileName: string;
	label?: string;
}) {
	const [busy, setBusy] = useState(false);

	async function run() {
		const node = getElement();
		if (!node) return;
		setBusy(true);
		try {
			const { captureElementPng } = await import("@/lib/export/image");
			downloadBlob(await captureElementPng(node), `${safeFileName(fileName)}.png`);
		} finally {
			setBusy(false);
		}
	}

	return <IconButton label={busy ? "Generando imagen..." : label} icon={FileDown} disabled={busy} onClick={run} />;
}
