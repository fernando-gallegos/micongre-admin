"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Spinner";
import {
	exampleValues,
	MESSAGE_KEYWORDS,
	MESSAGE_KIND_LABEL,
	renderTemplate,
	type MessageKind,
} from "@/lib/weekend/messageTemplate";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

type Templates = Record<MessageKind, string>;
const KINDS: MessageKind[] = ["incoming", "outgoing"];

/** Pestaña «Mensaje»: edita las plantillas del mensaje para oradores (invitado que llega / local que sale). */
export function MessageTemplates() {
	const [saved, setSaved] = useState<Templates | null>(null);
	const [defaults, setDefaults] = useState<Templates | null>(null);
	const [draft, setDraft] = useState<Partial<Templates>>({});
	const [saving, setSaving] = useState<MessageKind | null>(null);
	const [error, setError] = useState<string | null>(null);
	const areas = useRef<Partial<Record<MessageKind, HTMLTextAreaElement | null>>>({});

	useEffect(() => {
		fetch("/api/weekend/message-templates")
			.then((r) => r.json() as Promise<{ templates: Templates; defaults: Templates }>)
			.then((body) => {
				setSaved(body.templates);
				setDefaults(body.defaults);
			})
			.catch(() => setError("No se pudieron cargar las plantillas."));
	}, []);

	useUnsavedChanges(Object.keys(draft).length > 0);

	if (!saved || !defaults) return error ? <p className="text-sm text-red-600">{error}</p> : <PageLoader />;

	const current = (kind: MessageKind) => draft[kind] ?? saved[kind];

	function insert(kind: MessageKind, key: string) {
		const area = areas.current[kind];
		const value = current(kind);
		const start = area?.selectionStart ?? value.length;
		const end = area?.selectionEnd ?? value.length;
		const next = value.slice(0, start) + `{${key}}` + value.slice(end);
		setDraft((d) => ({ ...d, [kind]: next }));
		requestAnimationFrame(() => {
			area?.focus();
			const pos = start + key.length + 2;
			area?.setSelectionRange(pos, pos);
		});
	}

	async function save(kind: MessageKind) {
		setSaving(kind);
		setError(null);
		const response = await fetch("/api/weekend/message-templates", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ kind, body: current(kind) }),
		});
		setSaving(null);
		if (!response.ok) {
			setError("No se pudo guardar la plantilla.");
			return;
		}
		setSaved((s) => (s ? { ...s, [kind]: current(kind) } : s));
		setDraft((d) => {
			const { [kind]: _removed, ...rest } = d;
			void _removed;
			return rest;
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-ink-soft">
				Edita el mensaje para los oradores. Toca una palabra clave para insertarla donde está el cursor. Una línea cuyas palabras clave queden vacías (por ejemplo, la dirección si no está registrada) no aparece en el mensaje. En el planificador, el ícono de copiar arma este mensaje con los datos de la reunión.
			</p>
			{error && <p className="text-sm text-red-600">{error}</p>}
			{KINDS.map((kind) => {
				const dirty = draft[kind] !== undefined && draft[kind] !== saved[kind];
				return (
					<Card key={kind} className="flex flex-col gap-3">
						<h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">{MESSAGE_KIND_LABEL[kind]}</h3>
						<div className="flex flex-wrap gap-1.5">
							{MESSAGE_KEYWORDS.map((k) => (
								<button
									key={k.key}
									type="button"
									title={`${k.label} — ejemplo: ${k.example}`}
									onClick={() => insert(kind, k.key)}
									className="min-h-9 rounded-full border border-border px-3 text-xs font-medium text-ink hover:bg-surface-alt"
								>
									{"{" + k.key + "}"}
								</button>
							))}
						</div>
						<textarea
							ref={(el) => {
								areas.current[kind] = el;
							}}
							value={current(kind)}
							onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))}
							rows={8}
							className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
						/>
						<div>
							<p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Vista previa (datos de ejemplo)</p>
							<pre className="whitespace-pre-wrap rounded-2xl bg-surface-alt px-4 py-3 text-sm text-ink">{renderTemplate(current(kind), exampleValues())}</pre>
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							<Button variant="secondary" disabled={current(kind) === defaults[kind]} onClick={() => setDraft((d) => ({ ...d, [kind]: defaults[kind] }))}>
								Restaurar plantilla original
							</Button>
							<Button disabled={!dirty || saving === kind} onClick={() => save(kind)}>
								{saving === kind ? "Guardando..." : "Guardar"}
							</Button>
						</div>
					</Card>
				);
			})}
		</div>
	);
}
