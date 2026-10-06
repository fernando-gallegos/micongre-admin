"use client";

import Link from "next/link";
import { NotificationFeed, useReceivedNotifications } from "@/components/notifications/ReceivedNotifications";
import { SectionLabel } from "@/components/ui/Layout";

// En Mi panel solo se asoman los avisos más recientes; el resto está en la pestaña Avisos.
const PREVIEW_COUNT = 3;

export function MyNotifications() {
	const { items, loading, dismiss } = useReceivedNotifications();

	if (loading || items.length === 0) return null;

	return (
		<section>
			<SectionLabel
				right={
					<Link href="/notifications" className="font-medium text-accent hover:underline">
						{items.length > PREVIEW_COUNT ? `Ver todos (${items.length})` : "Ver todos"}
					</Link>
				}
			>
				Avisos
			</SectionLabel>
			<NotificationFeed items={items.slice(0, PREVIEW_COUNT)} onDismiss={dismiss} />
		</section>
	);
}
