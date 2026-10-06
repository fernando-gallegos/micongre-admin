"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { NotificationMarkdown } from "@/components/notifications/NotificationMarkdown";
import { IconButton, List } from "@/components/ui/Layout";
import { formatShortDate } from "@/lib/dateFormat";

export interface ReceivedNotification {
	id: string;
	scope: "publisher" | "group" | "congregation";
	message: string;
	createdAt: string;
	senderName: string;
}

const SCOPE_LABEL: Record<ReceivedNotification["scope"], string> = {
	publisher: "Para mí",
	group: "Mi grupo",
	congregation: "Congregación",
};

/** "hace 2 h", "ayer", "hace 3 d"; pasada una semana, la fecha corta. */
function timeAgo(value: string): string {
	const date = new Date(value);
	const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
	if (minutes < 1) return "ahora";
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	const days = Math.floor(hours / 24);
	if (days === 1) return "ayer";
	if (days < 7) return `hace ${days} d`;
	return formatShortDate(date);
}

/** Avisos recibidos (GET /api/notifications/mine) y cómo ocultar uno. Lo usan Mi panel y la pestaña Recibidos. */
export function useReceivedNotifications() {
	const [items, setItems] = useState<ReceivedNotification[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function load() {
			const response = await fetch("/api/notifications/mine");
			if (response.ok) setItems(((await response.json()) as { items: ReceivedNotification[] }).items);
			setLoading(false);
		}
		load();
	}, []);

	const dismiss = useCallback((id: string) => {
		setItems((prev) => prev.filter((n) => n.id !== id));
		fetch(`/api/notifications/${id}/dismiss`, { method: "POST" });
	}, []);

	return { items, loading, dismiss };
}

/** Lista de avisos: punto de color, mensaje, quién y cuándo, y ocultar. */
export function NotificationFeed({
	items,
	onDismiss,
}: {
	items: ReceivedNotification[];
	onDismiss: (id: string) => void;
}) {
	return (
		<List>
			{items.map((n) => (
				<div key={n.id} className="flex items-start gap-3 py-3 pl-4 pr-2">
					<span className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
					<div className="min-w-0 flex-1 py-1">
						<NotificationMarkdown message={n.message} />
						<p className="mt-1.5 text-[13px] text-ink-soft">
							{n.senderName} · {timeAgo(n.createdAt)} · {SCOPE_LABEL[n.scope]}
						</p>
					</div>
					<IconButton label="Ocultar este aviso" icon={X} onClick={() => onDismiss(n.id)} />
				</div>
			))}
		</List>
	);
}
