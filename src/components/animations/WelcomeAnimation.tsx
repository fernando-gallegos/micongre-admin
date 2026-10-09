"use client";

import { useEffect } from "react";

/** Animación de bienvenida de Mi Panel (web). Si están activadas en Congregación y toca (la primera entrada de cada 5 minutos, lo decide
 * `GET /api/animations/next` con una cookie), reproduce una vez una animación Lottie elegida al azar entre las carpetas que le tocan a
 * la persona, en una capa fija abajo que no bloquea ningún clic y se puede cerrar. Respeta "reducir movimiento" del dispositivo.
 * La librería (lottie-web, versión ligera solo SVG) se descarga únicamente cuando hay una animación que reproducir. */
export function WelcomeAnimation({ enabled }: { enabled: boolean }) {
	useEffect(() => {
		if (!enabled) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		let cancelled = false;
		let host: HTMLDivElement | null = null;
		let destroy: (() => void) | null = null;

		const stop = () => {
			destroy?.();
			destroy = null;
			host?.remove();
			host = null;
		};

		(async () => {
			const next = await fetch("/api/animations/next", { cache: "no-store" })
				.then((r) => (r.ok ? (r.json() as Promise<{ animation: { id: string } | null }>) : null))
				.catch(() => null);
			if (cancelled || !next?.animation) return;
			const data = await fetch(`/api/animations/${next.animation.id}/file`)
				.then((r) => (r.ok ? (r.json() as Promise<{ w: number; h: number }>) : null))
				.catch(() => null);
			if (cancelled || !data) return;
			const lottie = (await import("lottie-web/build/player/lottie_light")).default;
			if (cancelled) return;

			// Alto: lo natural según la proporción del lienzo, con tope al 60 % de la pantalla; en pantallas angostas se recorta por los lados
			// (manteniendo el centro, donde ocurre la acción) para que el personaje no quede diminuto.
			const natural = window.innerWidth * (Number(data.h) / Number(data.w));
			const narrow = window.innerWidth < 640 && natural < 220;
			const height = Math.min(window.innerHeight * 0.6, narrow ? 220 : natural);

			host = document.createElement("div");
			host.setAttribute("aria-hidden", "true");
			host.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${height}px;z-index:55;pointer-events:none;transition:opacity .4s`;
			const close = document.createElement("button");
			close.type = "button";
			close.textContent = "×";
			close.setAttribute("aria-label", "Cerrar animación");
			close.style.cssText =
				"position:absolute;right:12px;top:-34px;width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.9);color:#333;font-size:18px;line-height:1;pointer-events:auto;cursor:pointer";
			close.onclick = stop;
			const stageEl = document.createElement("div");
			stageEl.style.cssText = "width:100%;height:100%";
			host.appendChild(stageEl);
			host.appendChild(close);
			document.body.appendChild(host);

			const player = lottie.loadAnimation({
				container: stageEl,
				renderer: "svg",
				loop: false,
				autoplay: true,
				animationData: data,
				rendererSettings: { preserveAspectRatio: narrow ? "xMidYMax slice" : "xMidYMax meet" },
			});
			destroy = () => player.destroy();
			// Ya empezó: no se vuelve a ofrecer en los próximos 5 minutos.
			void fetch("/api/animations/next", { method: "POST" }).catch(() => null);
			player.addEventListener("complete", () => {
				if (host) host.style.opacity = "0";
				setTimeout(stop, 450);
			});
		})();

		return () => {
			cancelled = true;
			stop();
		};
	}, [enabled]);

	return null;
}
