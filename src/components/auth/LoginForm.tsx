"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { switchAccount, useAccounts } from "./useAccounts";

export function LoginForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	// Con ?add=1 se agrega otra cuenta sin cerrar la actual; sin él, se ofrecen las cuentas guardadas en este navegador.
	const adding = searchParams.get("add") === "1";
	const { accounts } = useAccounts(!adding);
	const [switchError, setSwitchError] = useState<string | null>(null);

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
		// Al agregar una cuenta se recarga todo: los datos en pantalla eran de la cuenta anterior.
		if (adding) {
			window.location.assign(next);
			return;
		}
		router.push(next);
		router.refresh();
	}

	async function continueAs(id: string) {
		setSwitchError(null);
		if (!(await switchAccount(id))) setSwitchError("La sesión de esa cuenta venció: entra de nuevo con tu usuario y contraseña.");
	}

	return (
		<main className="flex min-h-dvh items-center justify-center bg-bg px-7 py-10">
			<div className="flex w-full max-w-sm flex-col gap-9">
				<div className="flex flex-col items-start gap-3.5">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/logo.svg" alt="Mi Congre" width={56} height={56} className="h-14 w-14 rounded-[16px]" />
					<h1 className="font-display text-4xl font-medium leading-[1.1] text-ink">{adding ? "Agregar cuenta" : "Bienvenido a Mi Congre"}</h1>
					<p className="text-[15px] leading-normal text-ink-soft">
						{adding ? "Entra con la otra cuenta; la actual se queda guardada en este dispositivo." : "Entra con tu usuario y contraseña."}
					</p>
				</div>
				{!adding && accounts.length > 0 && (
					<div className="flex flex-col gap-2">
						<p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Cuentas en este dispositivo</p>
						{accounts.map((a) => (
							<button
								key={a.id}
								type="button"
								onClick={() => continueAs(a.id)}
								className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left hover:bg-surface-alt"
							>
								<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
									{a.fullName
										.split(/\s+/)
										.slice(0, 2)
										.map((p) => p[0])
										.join("")
										.toUpperCase()}
								</span>
								<span className="min-w-0 flex-1 truncate text-base font-medium text-ink">Continuar como {a.fullName}</span>
							</button>
						))}
						{switchError && <p className="text-sm text-red-600">{switchError}</p>}
					</div>
				)}
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
