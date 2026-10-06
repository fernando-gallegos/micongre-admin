"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface ImportResult {
	created: number;
	updated: number;
	total: number;
}

const ERROR_MESSAGES: Record<string, string> = {
	missing_file: "Selecciona un archivo EPUB.",
	unrecognized_file: "No se reconoció la estructura del archivo S-99a en este EPUB.",
};

export function EpubOutlineImportDialog({
	open,
	onClose,
	onImported,
}: {
	open: boolean;
	onClose: () => void;
	onImported: () => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ImportResult | null>(null);

	async function runImport() {
		const file = fileRef.current?.files?.[0];
		if (!file) {
			setError(ERROR_MESSAGES.missing_file);
			return;
		}
		setLoading(true);
		setError(null);

		const formData = new FormData();
		formData.append("file", file);
		const response = await fetch("/api/weekend/outlines/import", { method: "POST", body: formData });
		setLoading(false);

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			setError(ERROR_MESSAGES[body.error ?? ""] ?? "No se pudo importar el archivo.");
			return;
		}

		const body = (await response.json()) as ImportResult;
		setResult(body);
		onImported();
	}

	function handleClose() {
		setResult(null);
		setError(null);
		onClose();
	}

	return (
		<Modal open={open} onClose={handleClose} title="Importar catálogo S-99a">
			<div className="flex flex-col gap-3">
				<p className="text-sm text-ink-soft">
					Sube el archivo EPUB del formulario S-99a ("Títulos de los discursos públicos ordenados por
					temas"). Se agregan los bosquejos nuevos y se actualizan la categoría/título de los que ya
					existan por número.
				</p>

				{!result && (
					<>
						<input ref={fileRef} type="file" accept=".epub" className="text-sm" />
						{error && <p className="text-sm text-red-600">{error}</p>}
						<Button disabled={loading} onClick={runImport} className="mt-2">
							{loading ? "Importando..." : "Importar"}
						</Button>
					</>
				)}

				{result && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-ink">
							Catálogo importado: {result.created} bosquejo{result.created === 1 ? "" : "s"} nuevo
							{result.created === 1 ? "" : "s"}, {result.updated} actualizado{result.updated === 1 ? "" : "s"}, de{" "}
							{result.total} en total.
						</p>
						<Button onClick={handleClose}>Listo</Button>
					</div>
				)}
			</div>
		</Modal>
	);
}
