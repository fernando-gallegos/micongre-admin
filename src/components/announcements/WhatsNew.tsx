"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NotificationMarkdown } from "@/components/notifications/NotificationMarkdown";

export interface WhatsNewItem {
	id: string;
	title: string;
	image: string | null;
	intro: string | null;
	body: string | null;
	items: { title: string; text: string }[];
}

/** Pantalla de novedades: al entrar se muestran, una por una, las novedades publicadas que le tocan a la persona y aún no ha visto. Al
 * cerrar cada una queda vista para siempre (en todos sus dispositivos). */
export function WhatsNew({ preview }: { preview?: WhatsNewItem[] } = {}) {
	const [queue, setQueue] = useState<WhatsNewItem[]>(preview ?? []);

	useEffect(() => {
		// Vista previa (solo desarrollo): datos de ejemplo, sin pedir ni marcar nada.
		if (preview) return;
		let cancelled = false;
		fetch("/api/announcements")
			.then((r) => (r.ok ? r.json() : { items: [] }))
			.then((body: unknown) => {
				if (!cancelled) setQueue((body as { items?: WhatsNewItem[] }).items ?? []);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [preview]);

	const current = queue[0];
	if (!current) return null;

	function close() {
		if (!preview) fetch(`/api/announcements/${encodeURIComponent(current.id)}/seen`, { method: "POST" }).catch(() => {});
		setQueue((q) => q.slice(1));
	}

	return (
		<div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
			<div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-xl sm:rounded-3xl">
				<div className="flex-1 overflow-y-auto">
					{current.image ? (
						// La imagen a todo el ancho y 200 px de alto (se recorta para llenar, sin deformarse).
						// eslint-disable-next-line @next/next/no-img-element
						<img src={current.image} alt="" className="block h-[200px] w-full object-cover" />
					) : (
						<div className="bg-accent px-6 pb-2 pt-6 text-accent-ink">
							<Sparkles size={28} aria-hidden />
						</div>
					)}
					<div className={current.image ? "px-6 pt-5" : "bg-accent px-6 pb-5 text-accent-ink"}>
						<h2 id="whats-new-title" className={`font-display text-2xl font-medium leading-tight ${current.image ? "text-ink" : ""}`}>
							{current.title}
						</h2>
						{current.intro && <p className={`mt-1 text-sm ${current.image ? "text-ink-soft" : "opacity-90"}`}>{current.intro}</p>}
					</div>
					{current.body && (
						<div className="px-6 pt-4 text-[15px] leading-relaxed text-ink">
							<NotificationMarkdown message={current.body} variant="article" />
						</div>
					)}
					{current.items.length > 0 && (
						<ul className="space-y-4 px-6 py-5">
							{current.items.map((item) => (
								<li key={item.title}>
									<p className="font-semibold text-ink">{item.title}</p>
									<p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{item.text}</p>
								</li>
							))}
						</ul>
					)}
					<div className="h-4" />
				</div>
				<div className="border-t border-line px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<Button className="w-full justify-center" onClick={close}>
						Entendido
					</Button>
				</div>
			</div>
		</div>
	);
}
