"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setLoading(true);
		setError(null);

		const response = await fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});

		if (!response.ok) {
			setError("Usuario o contraseña incorrectos.");
			setLoading(false);
			return;
		}

		const next = searchParams.get("next") ?? "/panel";
		router.push(next);
		router.refresh();
	}

	return (
		<main className="flex min-h-dvh items-center justify-center bg-bg px-7 py-10">
			<div className="flex w-full max-w-sm flex-col gap-9">
				<div className="flex flex-col items-start gap-3.5">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/logo.svg" alt="Mi Congre" width={56} height={56} className="h-14 w-14 rounded-[16px]" />
					<h1 className="font-display text-4xl font-medium leading-[1.1] text-ink">Bienvenido a Mi Congre</h1>
					<p className="text-[15px] leading-normal text-ink-soft">Entra con tu usuario y contraseña.</p>
				</div>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<Input
						label="Usuario"
						autoComplete="username"
						autoCapitalize="none"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						required
					/>
					<Input
						label="Contraseña"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<Button type="submit" disabled={loading} className="mt-1.5 min-h-[52px] w-full text-base">
						{loading ? "Entrando..." : "Entrar"}
					</Button>
				</form>
				<p className="text-[13px] leading-normal text-ink-soft">
					¿Primera vez? Abre el enlace de activación que te enviaron para crear tu acceso.
				</p>
			</div>
		</main>
	);
}
