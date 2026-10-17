"use client";

import { useEffect } from "react";

// Pantallas con botón «Guardar»: si hay cambios sin guardar, salir de la página (enlaces del menú, cerrar o recargar la
// pestaña) o cambiar de semana pide confirmación para no perder lo hecho. Un solo juego de escuchas para todas las pantallas.

const MESSAGE = "Hay cambios sin guardar. Si sales ahora se perderán. ¿Salir y perder los cambios?";

let active = 0;
let installed = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
	event.preventDefault();
	event.returnValue = "";
}

function onClick(event: MouseEvent) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
	if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
	const url = new URL(link.href, window.location.href);
	// Enlaces a otro sitio los cubre beforeunload; el mismo destino no es salir.
	if (url.origin !== window.location.origin) return;
	if (url.pathname === window.location.pathname && url.search === window.location.search) return;
	if (!window.confirm(MESSAGE)) {
		event.preventDefault();
		event.stopPropagation();
	}
}

function install() {
	if (installed) return;
	installed = true;
	window.addEventListener("beforeunload", onBeforeUnload);
	document.addEventListener("click", onClick, true);
}

function uninstall() {
	if (!installed) return;
	installed = false;
	window.removeEventListener("beforeunload", onBeforeUnload);
	document.removeEventListener("click", onClick, true);
}

/** Registra la pantalla como «con cambios sin guardar» mientras `dirty` sea verdadero. */
export function useUnsavedChanges(dirty: boolean) {
	useEffect(() => {
		if (!dirty) return;
		active += 1;
		install();
		return () => {
			active -= 1;
			if (active <= 0) {
				active = 0;
				uninstall();
			}
		};
	}, [dirty]);
}

/** Para acciones dentro de la misma página que descartan cambios (p. ej. cambiar de semana): true si se puede seguir. */
export function confirmDiscardChanges(): boolean {
	return active === 0 || window.confirm(MESSAGE);
}
