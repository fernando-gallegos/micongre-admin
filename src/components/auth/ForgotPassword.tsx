"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/** «¿Olvidaste tu contraseña?» bajo el login: pide el usuario o el nombre y avisa a quien puede generar un enlace nuevo
 * (`POST /api/auth/forgot`). La respuesta es siempre la misma, exista o no la cuenta. */
export function ForgotPassword({ initialIdentifier }: { initialIdentifier: string }) {
	const [open, setOpen] = useState(false);
	const [identifier, setIdentifier] = useState("");
	const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => {
					setIdentifier(initialIdentifier);
					setOpen(true);
				}}
				className="self-center text-sm font-medium text-accent hover:underline"
			>
				¿Olvidaste tu contraseña?
			</button>
		);
	}

	if (state === "sent") {
		return (
			<div className="rounded-2xl bg-surface-alt p-4 text-sm text-ink">
				<p className="font-semibold">Listo, pedimos ayuda por ti.</p>
				<p className="mt-1 text-ink-soft">
					Si los datos coinciden con una persona de la congregación, le avisamos a tu superintendente de grupo y a quien administra las
					cuentas. Te enviarán un enlace nuevo (por WhatsApp o en persona); al abrirlo verás tu usuario y una contraseña nueva.
				</p>
			</div>
		);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		setState("sending");
		const response = await fetch("/api/auth/forgot", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ identifier }),
		}).catch(() => null);
		setState(response?.ok ? "sent" : "error");
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-surface-alt p-4">
			<p className="text-sm text-ink">
				Escribe tu usuario o tu nombre completo. Avisaremos a tu superintendente de grupo y a quien administra las cuentas para que te
				envíen un enlace nuevo.
			</p>
			<Input
				label="Usuario o nombre completo"
				autoCapitalize="none"
				value={identifier}
				onChange={(e) => setIdentifier(e.target.value)}
				minLength={2}
				required
			/>
			{state === "error" && <p className="text-sm text-red-600">No se pudo enviar. Revisa tu conexión e intenta de nuevo.</p>}
			<div className="flex gap-2">
				<Button type="submit" disabled={state === "sending" || identifier.trim().length < 2} className="flex-1">
					{state === "sending" ? "Enviando..." : "Pedir ayuda"}
				</Button>
				<Button type="button" variant="secondary" onClick={() => setOpen(false)}>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
