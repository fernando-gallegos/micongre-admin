"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";

// Botón "Enviar": asignar no notifica, el push sale solo al presionarlo. Es un
// ícono con globito de ayuda. Con `onMessage` el resultado lo muestra el
// contenedor; sin él, se muestra junto al botón.
export function SendAssignmentsButton({
	endpoint,
	onMessage,
}: {
	endpoint: string;
	onMessage?: (message: string | null) => void;
}) {
	const [sending, setSending] = useState(false);
	const [localMessage, setLocalMessage] = useState<string | null>(null);
	const setMessage = onMessage ?? setLocalMessage;
	const message = onMessage ? null : localMessage;

	async function send() {
		setSending(true);
		setMessage(null);
		const response = await fetch(endpoint, { method: "POST" });
		if (response.ok) {
			const body = (await response.json()) as { sent: number };
			setMessage(body.sent === 0 ? "Todavía no hay nadie asignado." : `Aviso enviado (${body.sent}).`);
		} else {
			setMessage("No se pudo enviar el aviso.");
		}
		setSending(false);
	}

	return (
		<div className="flex items-center gap-2">
			{message && <span className="text-xs text-ink-soft">{message}</span>}
			<IconButton
				label={sending ? "Enviando..." : "Enviar aviso con las asignaciones"}
				icon={Send}
				tone="accent"
				disabled={sending}
				onClick={send}
			/>
		</div>
	);
}
