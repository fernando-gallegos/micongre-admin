"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";

/** Copia al portapapeles el mensaje (plantilla de la pestaña «Mensaje» con los datos de esta reunión) para pegarlo en cualquier mensajería. */
export function CopyMessageButton({
	kind,
	id,
	disabled,
	label,
}: {
	kind: "incoming" | "outgoing";
	id: string;
	disabled?: boolean;
	label?: string;
}) {
	const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");

	async function copy() {
		setState("busy");
		try {
			const query = new URLSearchParams({ kind, [kind === "incoming" ? "meetingId" : "outgoingId"]: id });
			const response = await fetch(`/api/weekend/message?${query.toString()}`);
			if (!response.ok) throw new Error("failed");
			const { text } = (await response.json()) as { text: string };
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				// Navegadores sin permiso del portapapeles: se copia con un área de texto temporal.
				const area = document.createElement("textarea");
				area.value = text;
				area.style.position = "fixed";
				area.style.opacity = "0";
				document.body.appendChild(area);
				area.select();
				const ok = document.execCommand("copy");
				area.remove();
				if (!ok) throw new Error("copy_failed");
			}
			setState("copied");
		} catch {
			setState("error");
		}
		setTimeout(() => setState("idle"), 2000);
	}

	const text =
		state === "copied" ? "Mensaje copiado" : state === "error" ? "No se pudo copiar" : (label ?? (kind === "incoming" ? "Copiar mensaje para el orador invitado" : "Copiar mensaje para el orador"));
	return <IconButton label={text} icon={state === "copied" ? Check : Copy} disabled={disabled || state === "busy"} onClick={copy} />;
}
