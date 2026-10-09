"use client";

import { useEffect, useRef, useState } from "react";

/** Vista previa en bucle de una animación guardada (Congregación → Animaciones). */
export function LottiePreview({ id }: { id: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let destroy: (() => void) | null = null;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/animations/${id}/file`);
				if (!res.ok) throw new Error("file");
				const data = await res.json();
				const lottie = (await import("lottie-web/build/player/lottie_light")).default;
				if (cancelled || !ref.current) return;
				const player = lottie.loadAnimation({ container: ref.current, renderer: "svg", loop: true, autoplay: true, animationData: data });
				destroy = () => player.destroy();
			} catch {
				if (!cancelled) setError(true);
			}
		})();
		return () => {
			cancelled = true;
			destroy?.();
		};
	}, [id]);

	return error ? (
		<p className="text-sm text-red-600">No se pudo reproducir este archivo.</p>
	) : (
		<div ref={ref} className="w-full overflow-hidden rounded-2xl bg-surface-alt" />
	);
}
