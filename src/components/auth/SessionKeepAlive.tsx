"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// El access token dura 15 min (ver lib/auth/constants.ts); renovamos bastante
// antes de que venza para que la sesión nunca se sienta cortada mientras la
// pestaña sigue abierta. `middleware.ts` es la red de seguridad para cuando
// esto no alcanza a correr a tiempo (pestaña en segundo plano, equipo
// suspendido) — la sesión solo debe terminar por un logout explícito.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionKeepAlive() {
	const router = useRouter();
	const inFlight = useRef(false);

	useEffect(() => {
		let cancelled = false;

		async function refresh() {
			if (inFlight.current) return;
			inFlight.current = true;
			try {
				const response = await fetch("/api/auth/refresh", { method: "POST" });
				if (!response.ok && !cancelled) {
					// Refresh token inválido/vencido/reusado, o cuenta deshabilitada:
					// ahí sí la sesión terminó de verdad.
					router.push("/login");
					router.refresh();
				}
			} catch {
				// Sin red por un momento: reintentamos en el próximo tick, no cerramos la sesión.
			} finally {
				inFlight.current = false;
			}
		}

		const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

		function onVisibilityChange() {
			if (document.visibilityState === "visible") refresh();
		}
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			cancelled = true;
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [router]);

	return null;
}
