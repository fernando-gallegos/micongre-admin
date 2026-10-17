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
	download_failed: "No se pudo descargar de JW.ORG. Inténtalo de nuevo o sube el archivo EPUB.",
	unrecognized_file: "No se reconocieron canciones en este EPUB. Usa «Cantemos con gozo» (sjj).",
};

/** Importa el catálogo de canciones desde el EPUB «Cantemos con gozo» (sjj). */
export function SongsImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ImportResult | null>(null);

	// Sin archivo, el servidor descarga el cancionero de JW.ORG.
	async function runImport(fromJw: boolean) {
		const file = fileRef.current?.files?.[0];
		if (!fromJw && !file) {
			setError(ERROR_MESSAGES.missing_file);
			return;
		}
		setLoading(true);
		setError(null);
		const formData = new FormData();
		if (!fromJw && file) formData.append("file", file);
		const response = await fetch("/api/weekend/songs/import", { method: "POST", body: formData });
		setLoading(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			setError(ERROR_MESSAGES[body.error ?? ""] ?? "No se pudo importar el archivo.");
			return;
		}
		setResult((await response.json()) as ImportResult);
	}

	function handleClose() {
		setResult(null);
		setError(null);
		onClose();
	}

	return (
		<Modal open={open} onClose={handleClose} title="Importar canciones">
			<div className="flex flex-col gap-3">
				<p className="text-sm text-ink-soft">
					Importa el cancionero «Cantemos con gozo» (sjj). Sin elegir archivo se descarga de JW.ORG; o sube el EPUB. Se agregan las canciones nuevas y se actualiza el título de las que ya existan por número. Después podrás asignar una canción a cada discurso de cada orador.
				</p>
				{!result && (
					<>
						<input ref={fileRef} type="file" accept=".epub" className="text-sm" />
						{error && <p className="text-sm text-red-600">{error}</p>}
						<Button disabled={loading} onClick={() => runImport(!fileRef.current?.files?.[0])} className="mt-2">
							{loading ? "Importando..." : "Importar"}
						</Button>
					</>
				)}
				{result && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-ink">
							Catálogo importado: {result.created} canción{result.created === 1 ? "" : "es"} nueva{result.created === 1 ? "" : "s"}, {result.updated} actualizada{result.updated === 1 ? "" : "s"}, de {result.total} en total.
						</p>
						<Button onClick={handleClose}>Listo</Button>
					</div>
				)}
			</div>
		</Modal>
	);
}
