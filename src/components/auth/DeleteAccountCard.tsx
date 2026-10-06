"use client";

import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const ERRORS: Record<string, string> = {
	invalid_password: "La contraseña no es correcta.",
	last_admin: "Eres el único administrador con acceso: antes de eliminar tu cuenta, da acceso de administrador a otra persona.",
};

/** Mi perfil → Eliminar mi cuenta: quita el acceso (usuario, contraseña, sesiones, dispositivos) pero no la ficha de publicador. */
export function DeleteAccountCard() {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function close() {
		if (busy) return;
		setOpen(false);
		setPassword("");
		setError(null);
	}

	async function run() {
		setBusy(true);
		setError(null);
		const response = await fetch("/api/auth/delete-account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password }),
		}).catch(() => null);
		if (response?.ok) {
			window.location.assign("/login");
			return;
		}
		const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
		setError((body?.error && ERRORS[body.error]) ?? "No se pudo eliminar la cuenta. Intenta de nuevo.");
		setBusy(false);
	}

	return (
		<>
			<Card className="flex flex-col gap-3">
				<p className="text-sm leading-relaxed text-ink-soft">
					Elimina tu usuario y contraseña y cierra tus sesiones en la web y en la app (también deja de recibir avisos). Tu ficha
					de publicador, tus asignaciones y tus informes siguen en la congregación; los administra quien lleva este sitio, y si
					quieres que se borren también, pídeselo a ellos. Más tarde un administrador puede darte acceso de nuevo.
				</p>
				<div>
					<Button variant="secondary" className="!border-red-300 !text-red-700 hover:!bg-red-50" onClick={() => setOpen(true)}>
						<Trash2 size={18} />
						Eliminar mi cuenta
					</Button>
				</div>
			</Card>

			<Modal open={open} onClose={close} title="Eliminar mi cuenta">
				<div className="flex flex-col gap-4">
					<p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
						<TriangleAlert size={16} className="mt-0.5 shrink-0" />
						<span>Ya no podrás entrar con tu usuario y contraseña actuales. Esto no se puede deshacer por tu cuenta.</span>
					</p>
					<Input
						label="Escribe tu contraseña para confirmar"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={busy}
					/>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<div className="flex justify-end gap-2">
						<Button variant="ghost" onClick={close} disabled={busy}>
							Cancelar
						</Button>
						<Button variant="danger" onClick={run} disabled={!password || busy}>
							{busy && <Loader2 size={16} className="animate-spin" />}
							Eliminar mi cuenta
						</Button>
					</div>
				</div>
			</Modal>
		</>
	);
}
