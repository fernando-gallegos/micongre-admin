"use client";

import { Tooltip } from "@/components/ui/Tooltip";

export interface PanelLink {
	kind: "congregation" | "appointed" | "elders" | "zoom" | "hub";
	label: string;
	url: string;
	color: string;
}

function WhatsAppGlyph() {
	return (
		<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
			<path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.3 15l-.3-.2-3 .87.9-2.9-.2-.3A8.1 8.1 0 0 1 12.04 3.8Zm-3.2 4.2c-.2 0-.5.07-.75.35-.25.27-.97.95-.97 2.3s1 2.7 1.13 2.88c.14.18 1.95 3.1 4.8 4.22 2.37.93 2.85.75 3.37.7.52-.04 1.66-.68 1.9-1.33.23-.66.23-1.22.16-1.34-.07-.11-.25-.18-.52-.32-.28-.14-1.66-.82-1.9-.91-.26-.1-.44-.14-.63.14-.18.27-.72.9-.88 1.1-.16.18-.32.2-.6.07-.27-.14-1.17-.43-2.22-1.37-.82-.73-1.37-1.63-1.53-1.9-.16-.28-.02-.43.12-.57.12-.12.28-.32.42-.48.14-.16.18-.28.28-.46.09-.19.05-.35-.02-.48-.07-.14-.62-1.5-.86-2.06-.22-.54-.45-.46-.62-.47h-.53Z" />
		</svg>
	);
}

function HubGlyph() {
	return (
		<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="9" />
			<path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
		</svg>
	);
}

function ZoomGlyph() {
	return (
		<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
			<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h6A2.5 2.5 0 0 1 15 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 4 16.5v-9Zm12.2 2.6 3.7-2.6c.5-.35 1.1 0 1.1.6v9.8c0 .6-.6.95-1.1.6l-3.7-2.6v-5.8Z" />
		</svg>
	);
}

/** Botones redondos de acceso rápido (grupos de mensajería y Zoom) al final de Mi Panel. */
export function PanelLinks({ links }: { links: PanelLink[] }) {
	if (links.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center justify-center gap-4 pb-2 pt-2" data-count={links.length}>
			{links.map((l) => (
				<Tooltip key={l.kind} content={l.label}>
					<a
						href={l.url}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={l.label}
						className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
						style={{ background: l.color }}
					>
						{l.kind === "zoom" ? <ZoomGlyph /> : l.kind === "hub" ? <HubGlyph /> : <WhatsAppGlyph />}
					</a>
				</Tooltip>
			))}
		</div>
	);
}
