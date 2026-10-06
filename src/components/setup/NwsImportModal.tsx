"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, Circle, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
	buildNwsImport,
	classifyNwsFile,
	NWS_KINDS,
	NwsError,
	type NwsBundle,
	type NwsKind,
	type NwsRow,
} from "@/lib/setup/nws";

interface LoadedFile {
	fileName: string;
	text: string;
	rows: NwsRow[];
}

// Panel de carga para NWScheduler: exporta un CSV por cada opción de
// "Importar o Exportar", así que aquí se piden todos. Cada archivo se
// reconoce por su CONTENIDO (no por el nombre) y se ubica en su casilla; con lo
// que haya cargado se calcula, sin guardar nada, qué se va a migrar. El envío
// al servidor (que guarda todo de una vez) lo hace quien abre este panel.
export function NwsImportModal({
	open,
	onClose,
	onImport,
}: {
	open: boolean;
	onClose: () => void;
	onImport: (texts: string[]) => void;
}) {
	const [files, setFiles] = useState<Partial<Record<NwsKind, LoadedFile>>>({});
	const [messages, setMessages] = useState<string[]>([]);
	const input = useRef<HTMLInputElement>(null);

	const bundle = useMemo<NwsBundle>(
		() => Object.fromEntries(Object.entries(files).map(([kind, f]) => [kind, f.rows])) as NwsBundle,
		[files],
	);

	// Vista previa (no guarda nada): el mismo armado que hará el servidor.
	const preview = useMemo(() => {
		if (!files.persons) return null;
		try {
			const { stats, warnings } = buildNwsImport(bundle);
			return { stats, warnings, error: null as string | null };
		} catch (error) {
			return { stats: null, warnings: [] as string[], error: error instanceof NwsError ? error.message : "No se pudo analizar los archivos." };
		}
	}, [bundle, files.persons]);

	async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
		const picked = [...(event.target.files ?? [])];
		event.target.value = "";
		const next = { ...files };
		const notes: string[] = [];
		for (const file of picked) {
			const text = await file.text();
			const classified = classifyNwsFile(text);
			if (!classified) {
				notes.push(`«${file.name}» no es un archivo de NWScheduler que conozcamos (Personas, Contactos de emergencia, Informes, Discursantes o Programa de discursos).`);
				continue;
			}
			if (classified.rows.length === 0) {
				notes.push(`«${file.name}» no tiene filas.`);
				continue;
			}
			const label = NWS_KINDS.find((k) => k.kind === classified.kind)!.label;
			if (next[classified.kind]) notes.push(`«${file.name}» reemplazó al archivo de ${label} que ya habías cargado.`);
			next[classified.kind] = { fileName: file.name, text, rows: classified.rows };
		}
		setFiles(next);
		setMessages(notes);
	}

	function remove(kind: NwsKind) {
		setFiles((f) => {
			const { [kind]: _removed, ...rest } = f;
			return rest;
		});
		setMessages([]);
	}

	function submit() {
		onImport(NWS_KINDS.map((k) => files[k.kind]?.text).filter((t): t is string => !!t));
	}

	if (!open) return null;

	const stats = preview?.stats;
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
			<div className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[28px] bg-surface p-6 pb-8 shadow-xl sm:rounded-[28px]">
				<h2 className="font-display text-xl font-medium text-ink">Migrar desde NWScheduler</h2>
				<p className="mt-1 text-sm text-ink-soft">
					En NWScheduler, ve a <span className="font-medium text-ink">Importar o Exportar</span> y exporta Personas, Contactos de
					emergencia, Informes de predicación, Discursantes y Programa de discursos públicos. Sube aquí los archivos (todos a la
					vez o uno por uno); se reconocen por su contenido, no por el nombre.
				</p>

				<div className="mt-4 overflow-y-auto">
					<ul className="flex flex-col gap-2">
						{NWS_KINDS.map(({ kind, label, hint, required }) => {
							const file = files[kind];
							return (
								<li key={kind} className="flex items-start gap-3 rounded-2xl bg-surface-alt px-4 py-3">
									{file ? (
										<CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />
									) : (
										<Circle size={18} className="mt-0.5 shrink-0 text-ink-soft" />
									)}
									<div className="min-w-0 flex-1 text-sm">
										<p className="font-medium text-ink">
											{label} {required && <span className="text-xs font-normal text-red-600">obligatorio</span>}
										</p>
										{file ? (
											<p className="truncate text-xs text-ink-soft">
												{file.fileName} · {file.rows.length} filas
											</p>
										) : (
											<p className="text-xs text-ink-soft">{hint}</p>
										)}
									</div>
									{file && (
										<button type="button" onClick={() => remove(kind)} className="min-h-9 px-1 text-xs text-ink-soft hover:text-red-600">
											Quitar
										</button>
									)}
								</li>
							);
						})}
					</ul>

					<input ref={input} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={handleFiles} />
					<Button type="button" variant="secondary" className="mt-3" onClick={() => input.current?.click()}>
						<Upload size={16} /> Elegir archivos CSV
					</Button>

					{messages.map((m) => (
						<p key={m} className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
							<TriangleAlert size={14} className="mt-0.5 shrink-0" /> {m}
						</p>
					))}

					{preview?.error && <p className="mt-3 text-sm text-red-600">{preview.error}</p>}

					{stats && (
						<div className="mt-4 rounded-2xl bg-surface-alt p-4 text-sm">
							<p className="mb-1 flex items-center gap-1.5 font-medium text-ink">
								<FileSpreadsheet size={15} /> Se migrará
							</p>
							<p className="text-ink-soft">
								{stats.people} personas ({stats.inactive} inactivas), {stats.households} hogares, {stats.groups} grupos,{" "}
								{stats.appointments} nombramientos, {stats.privileges} privilegios, {stats.emergencyContacts} contactos de
								emergencia, {stats.reports} informes, {stats.speakers} oradores ({stats.visitingCongregations} congregaciones
								visitantes) y {stats.meetings} reuniones de fin de semana.
							</p>
							{preview.warnings.length > 0 && (
								<ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-amber-800">
									{preview.warnings.map((w) => (
										<li key={w}>{w}</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				<div className="mt-5 flex justify-end gap-2">
					<Button variant="ghost" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={submit} disabled={!files.persons || !!preview?.error}>
						Migrar
					</Button>
				</div>
			</div>
		</div>
	);
}
