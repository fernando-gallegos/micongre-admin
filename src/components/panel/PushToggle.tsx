"use client";

import { useEffect, useState } from "react";
import { List } from "@/components/ui/Layout";
import { getExistingSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";

export function PushToggle() {
	const [supported, setSupported] = useState(true);
	const [subscribed, setSubscribed] = useState(false);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			if (!isPushSupported()) {
				setSupported(false);
				setLoading(false);
				return;
			}
			const existing = await getExistingSubscription();
			setSubscribed(!!existing);
			setLoading(false);
		})();
	}, []);

	async function toggle() {
		setBusy(true);
		setError(null);
		try {
			if (subscribed) {
				await unsubscribeFromPush();
				setSubscribed(false);
			} else {
				await subscribeToPush();
				setSubscribed(true);
			}
		} catch (err) {
			setError(
				err instanceof Error && err.message === "permission_denied"
					? "Bloqueaste los permisos de notificación para este sitio — actívalos desde la configuración del navegador."
					: "No se pudo activar las notificaciones en este navegador.",
			);
		}
		setBusy(false);
	}

	if (!supported || loading) return null;

	return (
		<List>
			<div className="flex min-h-14 items-center gap-3 px-4 py-3">
				<div className="min-w-0 flex-1">
					<p id="push-toggle-label" className="text-base text-ink">
						Notificaciones en este dispositivo
					</p>
					<p className="mt-0.5 text-[13px] text-ink-soft">
						{subscribed ? "Activadas en este navegador" : "Recibe un aviso al instante cuando te asignen algo"}
					</p>
					{error && <p className="mt-1 text-xs text-red-600">{error}</p>}
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={subscribed}
					aria-labelledby="push-toggle-label"
					onClick={toggle}
					disabled={busy}
					className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${subscribed ? "bg-accent" : "bg-ink-soft/40"}`}
				>
					<span
						className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all ${subscribed ? "left-[23px]" : "left-[3px]"}`}
					/>
				</button>
			</div>
		</List>
	);
}
