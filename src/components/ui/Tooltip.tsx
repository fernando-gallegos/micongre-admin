"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const MARGIN = 8;
const HOVER_DELAY_MS = 350;

interface Placement {
	left: number;
	top: number;
	arrowLeft: number;
	side: "top" | "bottom";
}

/** Globito de ayuda para toda la app. Envuelve cualquier elemento (botón, enlace,
 * ícono...) sin cambiarle el diseño: aparece al pasar el cursor o al enfocarlo con
 * el teclado, se acomoda para no salirse de la pantalla y se dibuja fuera del
 * flujo (no lo recortan tablas ni modales). Los `Button` con `title` lo usan solos. */
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
	const wrapperRef = useRef<HTMLSpanElement>(null);
	const bubbleRef = useRef<HTMLDivElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [open, setOpen] = useState(false);
	const [placement, setPlacement] = useState<Placement | null>(null);

	const hide = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		setOpen(false);
		setPlacement(null);
	}, []);

	const show = useCallback((delay: number) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setOpen(true), delay);
	}, []);

	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);

	// Mientras está abierto, cualquier scroll, cambio de tamaño o Escape lo cierra.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
		window.addEventListener("scroll", hide, true);
		window.addEventListener("resize", hide);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("scroll", hide, true);
			window.removeEventListener("resize", hide);
			window.removeEventListener("keydown", onKey);
		};
	}, [open, hide]);

	// El wrapper no tiene caja propia (display: contents): se mide su primer hijo.
	useLayoutEffect(() => {
		if (!open) return;
		const target = (wrapperRef.current?.firstElementChild ?? wrapperRef.current) as HTMLElement | null;
		const bubble = bubbleRef.current;
		if (!target || !bubble) return;
		const t = target.getBoundingClientRect();
		const b = bubble.getBoundingClientRect();
		const side: Placement["side"] = t.top - b.height - GAP >= MARGIN ? "top" : "bottom";
		const top = side === "top" ? t.top - b.height - GAP : t.bottom + GAP;
		const center = t.left + t.width / 2;
		const left = Math.min(Math.max(center - b.width / 2, MARGIN), window.innerWidth - b.width - MARGIN);
		setPlacement({ left, top, arrowLeft: Math.min(Math.max(center - left, 12), b.width - 12), side });
	}, [open, content]);

	if (content === null || content === undefined || content === "") return <>{children}</>;

	return (
		<span
			ref={wrapperRef}
			className="contents"
			onMouseEnter={() => show(HOVER_DELAY_MS)}
			onMouseLeave={hide}
			onFocus={() => show(0)}
			onBlur={hide}
			onClickCapture={hide}
		>
			{children}
			{open &&
				createPortal(
					<div
						ref={bubbleRef}
						role="tooltip"
						style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, opacity: placement ? 1 : 0 }}
						className="pointer-events-none fixed z-[100] max-w-[16rem] rounded-xl bg-ink px-3 py-1.5 text-xs font-medium leading-snug text-surface shadow-lg transition-opacity duration-150"
					>
						{content}
						{placement && (
							<span
								style={{ left: placement.arrowLeft - 5 }}
								className={`absolute h-2.5 w-2.5 rotate-45 bg-ink ${placement.side === "top" ? "-bottom-[5px]" : "-top-[5px]"}`}
							/>
						)}
					</div>,
					document.body,
				)}
		</span>
	);
}
