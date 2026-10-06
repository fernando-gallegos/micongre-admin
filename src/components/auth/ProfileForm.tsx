"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";

const ERROR_MESSAGES: Record<string, string> = {
	invalid_current_password: "La contraseña actual no es correcta.",
	current_password_required: "Escribe tu contraseña actual para cambiar el usuario o la contraseña.",
	username_taken: "Ese usuario ya está en uso.",
	invalid_body: "Revisa los datos e intenta de nuevo.",
};

export function ProfileForm() {
	const router = useRouter();
	const [fullName, setFullName] = useState("");
	const [username, setUsername] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.json())
			.then((body: unknown) => {
				const data = body as { fullName: string; username: string | null };
				setFullName(data.fullName);
				setUsername(data.username ?? "");
			})
			.finally(() => setLoading(false));
	}, []);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError(null);
		setSuccess(false);

		const response = await fetch("/api/auth/me", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fullName,
				username,
				currentPassword: currentPassword || undefined,
				newPassword: newPassword || undefined,
			}),
		});

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string };
			setError((body.error && ERROR_MESSAGES[body.error]) ?? "No se pudo guardar. Intenta de nuevo.");
			setSaving(false);
			return;
		}

		// El nombre viaja también en el access token — refrescamos la sesión
		// para que se vea el cambio en todas partes sin cerrar sesión.
		await fetch("/api/auth/refresh", { method: "POST" });
		setSaving(false);
		setCurrentPassword("");
		setNewPassword("");
		setSuccess(true);
		router.refresh();
	}

	if (loading) return <PageLoader />;

	return (
		<Card>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<Input label="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
				<Input label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
				<div className="border-t border-border pt-4">
					<p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Cambiar contraseña</p>
					<div className="flex flex-col gap-4">
						<Input
							label="Contraseña actual"
							type="password"
							autoComplete="current-password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder="Requerida para cambiar usuario o contraseña"
						/>
						<Input
							label="Nueva contraseña (opcional)"
							type="password"
							autoComplete="new-password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="Déjalo en blanco para no cambiarla"
						/>
					</div>
				</div>
				{error && <p className="text-sm text-red-600">{error}</p>}
				{success && <p className="text-sm text-accent">Perfil actualizado.</p>}
				<Button type="submit" disabled={saving} className="w-full sm:w-auto sm:self-start">
					{saving ? "Guardando..." : "Guardar cambios"}
				</Button>
			</form>
		</Card>
	);
}
