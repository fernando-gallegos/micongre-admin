"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { ANIMATION_FOLDER_LABEL, ANIMATION_GROUPS, MAX_ANIMATIONS_PER_FOLDER, type AnimationFolder } from "@/lib/animations/folders";
import { LottiePreview } from "./LottiePreview";

interface Item {
	id: string;
	folder: AnimationFolder;
	name: string;
	size: number;
	width: number;
	height: number;
	durationMs: number;
}

const UPLOAD_ERRORS: Record<string, string> = {
	lottie_zip: "es un archivo .lottie; en LottieFiles Creator exporta como «Lottie JSON»",
	not_json_file: "no es un archivo .json",
	too_large: "pesa más de 1 MB",
	not_json: "no es un JSON válido",
	not_lottie: "no parece una animación de Lottie",
	folder_full: `la carpeta ya tiene ${MAX_ANIMATIONS_PER_FOLDER} animaciones`,
};

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** Congregación → Animaciones: carpetas de archivos Lottie (JSON) que se suben directo, sin desplegar. Ver lib/animations/folders.ts
 * para saber de qué carpetas sale la animación de cada persona. */
export function AnimationsCard() {
	const [items, setItems] = useState<Item[]>([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState<AnimationFolder | null>(null);
	const [messages, setMessages] = useState<string[]>([]);
	const [preview, setPreview] = useState<Item | null>(null);
	const [deleting, setDeleting] = useState<Item | null>(null);
	const inputs = useRef<Partial<Record<AnimationFolder, HTMLInputElement | null>>>({});

	const load = useCallback(async () => {
		const res = await fetch("/api/animations", { cache: "no-store" });
		if (res.ok) setItems(((await res.json()) as { items: Item[] }).items);
		setLoading(false);
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	async function upload(folder: AnimationFolder, files: FileList | null) {
		if (!files || files.length === 0) return;
		setUploading(folder);
		setMessages([]);
		const form = new FormData();
		form.set("folder", folder);
		for (const f of Array.from(files)) form.append("files", f);
		try {
			const res = await fetch("/api/animations", { method: "POST", body: form });
			if (!res.ok) throw new Error("upload");
			const { results } = (await res.json()) as { results: { file: string; ok: boolean; error?: string }[] };
			setMessages(results.filter((r) => !r.ok).map((r) => `${r.file}: ${UPLOAD_ERRORS[r.error ?? ""] ?? "no se pudo subir"}.`));
		} catch {
			setMessages(["No se pudo subir. Intenta de nuevo."]);
		} finally {
			setUploading(null);
			const input = inputs.current[folder];
			if (input) input.value = "";
			await load();
		}
	}

	async function remove(item: Item) {
		await fetch(`/api/animations/${item.id}`, { method: "DELETE" });
		setDeleting(null);
		await load();
	}

	return (
		<div className="flex flex-col gap-5">
			{ANIMATION_GROUPS.map((group) => (
				<div key={group.title} className="flex flex-col gap-3">
					<div>
						<p className="text-sm font-semibold text-ink">{group.title}</p>
						<p className="text-xs text-ink-soft">{group.hint}</p>
					</div>
					{group.folders.map((folder) => {
						const list = items.filter((i) => i.folder === folder);
						return (
							<div key={folder} className="rounded-2xl border border-border">
								<div className="flex items-center justify-between gap-2 px-4 py-2.5">
									<p className="text-sm font-medium text-ink">
										{ANIMATION_FOLDER_LABEL[folder]} <span className="text-ink-soft">· {list.length}/{MAX_ANIMATIONS_PER_FOLDER}</span>
									</p>
									<input
										ref={(el) => {
											inputs.current[folder] = el;
										}}
										type="file"
										multiple
										accept=".json,application/json"
										className="hidden"
										onChange={(e) => void upload(folder, e.target.files)}
									/>
									<Button variant="secondary" className="!min-h-9 !px-3" disabled={uploading !== null || list.length >= MAX_ANIMATIONS_PER_FOLDER} onClick={() => inputs.current[folder]?.click()}>
										<Upload size={15} />
										{uploading === folder ? "Subiendo..." : "Subir"}
									</Button>
								</div>
								{list.length > 0 && (
									<ul className="divide-y divide-border border-t border-border">
										{list.map((i) => (
											<li key={i.id} className="flex items-center gap-1 py-1.5 pl-4 pr-2">
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm text-ink">{i.name}</p>
													<p className="text-xs text-ink-soft">
														{(i.durationMs / 1000).toFixed(1)} s · {i.width}×{i.height} · {kb(i.size)}
													</p>
												</div>
												<IconButton label="Ver" icon={Play} onClick={() => setPreview(i)} />
												<IconButton label="Eliminar" icon={Trash2} tone="danger" onClick={() => setDeleting(i)} />
											</li>
										))}
									</ul>
								)}
							</div>
						);
					})}
				</div>
			))}
			{!loading && items.length === 0 && <p className="text-sm text-ink-soft">Todavía no hay animaciones. Sube archivos .json de Lottie (hasta 5 por carpeta) y cada persona verá una al azar entre las de sus carpetas.</p>}
			{messages.length > 0 && (
				<ul className="list-disc pl-5 text-sm text-red-600">
					{messages.map((m) => (
						<li key={m}>{m}</li>
					))}
				</ul>
			)}

			<Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? "Vista previa"}>
				{preview && <LottiePreview key={preview.id} id={preview.id} />}
			</Modal>
			<Modal open={!!deleting} onClose={() => setDeleting(null)} title="Eliminar animación">
				<div className="flex flex-col gap-4">
					<p className="text-sm text-ink">¿Eliminar «{deleting?.name}»? Ya no saldrá en Mi Panel.</p>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setDeleting(null)}>
							Cancelar
						</Button>
						<Button variant="danger" onClick={() => deleting && void remove(deleting)}>
							Eliminar
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
