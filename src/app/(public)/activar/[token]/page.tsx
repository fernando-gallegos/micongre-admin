"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { InlineLoader } from "@/components/ui/Spinner";

interface ActivationPreview {
	fullName: string;
	suggestedUsername: string;
	suggestedPassword: string;
	usernameEditable: boolean;
}

type State =
	| { status: "loading" }
	| { status: "ready"; preview: ActivationPreview }
	| { status: "submitting"; preview: ActivationPreview }
	| { status: "success"; fullName: string; username: string; password: string }
	| { status: "error"; message: string };

const LINK_ERROR_MESSAGES: Record<string, string> = {
	invalid: "Este enlace no es válido.",
	used: "Este enlace ya fue usado. Pide uno nuevo al encargado.",
	expired: "Este enlace venció. Pide uno nuevo al encargado.",
};

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
	username_taken: "Ese usuario ya está en uso. Elige otro.",
	invalid_body: "Revisa los datos e intenta de nuevo.",
	...LINK_ERROR_MESSAGES,
};

// Mismo contrato (en dos pasos: GET precarga, POST canjea) que consumirá la
// futura app Android como Android App Link — ver docs/mobile-activation-protocol.md.
export default function ActivarPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = use(params);
	const router = useRouter();
	const [state, setState] = useState<State>({ status: "loading" });
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		fetch(`/api/auth/activate?token=${encodeURIComponent(token)}`)
			.then(async (response) => {
				const body = (await response.json()) as ActivationPreview & { error?: string };
				if (cancelled) return;
				if (!response.ok) {
					setState({ status: "error", message: LINK_ERROR_MESSAGES[body.error ?? ""] ?? "Algo salió mal." });
					return;
				}
				setUsername(body.suggestedUsername);
				setPassword(body.suggestedPassword);
				setState({ status: "ready", preview: body });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error", message: "No se pudo conectar. Intenta de nuevo." });
			});

		return () => {
			cancelled = true;
		};
	}, [token]);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (state.status !== "ready" && state.status !== "submitting") return;
		const preview = state.preview;
		setSubmitError(null);
		setState({ status: "submitting", preview });

		const response = await fetch("/api/auth/activate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, username, password }),
		});

		const body = (await response.json().catch(() => ({}))) as { error?: string; user?: { fullName: string } };
		if (!response.ok) {
			setSubmitError(SUBMIT_ERROR_MESSAGES[body.error ?? ""] ?? "No se pudo activar. Intenta de nuevo.");
			setState({ status: "ready", preview });
			return;
		}

		setState({ status: "success", fullName: body.user?.fullName ?? preview.fullName, username, password });
	}

	return (
		<main className="flex min-h-dvh items-center justify-center bg-bg px-7 py-10">
			<div className="flex w-full max-w-sm flex-col gap-7">
				<div className="flex flex-col items-start gap-3.5">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/logo.svg" alt="Mi Congre" width={56} height={56} className="h-14 w-14 rounded-[16px]" />
					<span className="font-display text-xl font-semibold text-ink">Mi Congre</span>
				</div>

				{state.status === "loading" && <InlineLoader />}

				{state.status === "error" && (
					<div>
						<h1 className="font-display text-3xl font-medium leading-tight text-ink">No se pudo activar</h1>
						<p className="mt-2 text-[15px] leading-normal text-ink-soft">{state.message}</p>
					</div>
				)}

				{(state.status === "ready" || state.status === "submitting") && (
					<>
						<div>
							<h1 className="font-display text-3xl font-medium leading-tight text-ink">¡Hola, {state.preview.fullName}!</h1>
							<p className="mt-2 text-[15px] leading-normal text-ink-soft">
								{state.preview.usernameEditable
									? "Te sugerimos un usuario y una contraseña — puedes cambiarlos antes de continuar."
									: "Elige una nueva contraseña para tu cuenta. Tu usuario no cambia."}
							</p>
						</div>
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							<Input
								label="Usuario"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								disabled={!state.preview.usernameEditable}
								required
							/>
							<Input
								label="Contraseña"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={6}
							/>
							{submitError && <p className="text-sm text-red-600">{submitError}</p>}
							<Button type="submit" className="mt-1.5 min-h-[52px] w-full text-base" disabled={state.status === "submitting"}>
								{state.status === "submitting" ? "Activando..." : "Continuar"}
							</Button>
						</form>
					</>
				)}

				{state.status === "success" && (
					<>
						<div>
							<h1 className="font-display text-3xl font-medium leading-tight text-ink">¡Bienvenido, {state.fullName}!</h1>
							<p className="mt-2 text-[15px] leading-normal text-ink-soft">
								Guarda estos datos — los necesitarás si vuelves a entrar desde otro dispositivo.
							</p>
						</div>
						<Card className="flex flex-col gap-1.5 text-sm">
							<p>
								<span className="text-ink-soft">Usuario: </span>
								<span className="break-all font-mono font-semibold text-ink">{state.username}</span>
							</p>
							<p>
								<span className="text-ink-soft">Contraseña: </span>
								<span className="break-all font-mono font-semibold text-ink">{state.password}</span>
							</p>
						</Card>
						<Button className="min-h-[52px] w-full text-base" onClick={() => router.push("/panel")}>
							Continuar
						</Button>
					</>
				)}
			</div>
		</main>
	);
}
