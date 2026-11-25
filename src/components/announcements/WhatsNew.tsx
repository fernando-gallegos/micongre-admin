"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Item {
	id: string;
	title: string;
	intro: string | null;
	items: { title: string; text: string }[];
}

/** Pantalla de novedades: al entrar se muestran, una por una, las novedades publicadas que le tocan a la persona y aún no ha visto. Al
 * cerrar cada una queda vista para siempre (en todos sus dispositivos). */
export function WhatsNew() {
	const [queue, setQueue] = useState<Item[]>([]);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/announcements")
			.then((r) => (r.ok ? r.json() : { items: [] }))
			.then((body: unknown) => {
				if (!cancelled) setQueue((body as { items?: Item[] }).items ?? []);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const current = queue[0];
	if (!current) return null;

	function close() {
		fetch(`/api/announcements/${encodeURIComponent(current.id)}/seen`, { method: "POST" }).catch(() => {});
		setQueue((q) => q.slice(1));
	}

	return (
		<div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
			<div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-xl sm:rounded-3xl">
				<div className="bg-accent px-6 pb-5 pt-6 text-accent-ink">
					<Sparkles size={28} aria-hidden />
					<h2 id="whats-new-title" className="mt-2 font-display text-2xl font-medium leading-tight">
						{current.title}
					</h2>
					{current.intro && <p className="mt-1 text-sm opacity-90">{current.intro}</p>}
				</div>
				<ul className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
					{current.items.map((item) => (
						<li key={item.title}>
							<p className="font-semibold text-ink">{item.title}</p>
							<p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{item.text}</p>
						</li>
					))}
				</ul>
				<div className="border-t border-line px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<Button className="w-full justify-center" onClick={close}>
						Entendido
					</Button>
				</div>
			</div>
		</div>
	);
}
