// Solo cliente: ReportDoc (o un elemento del DOM) → imagen PNG.
import { createRoot } from "react-dom/client";
import { toBlob } from "html-to-image";
import { ReportSheet } from "@/components/export/ReportSheet";
import type { ReportDoc } from "./types";

const PIXEL_RATIO = 2;
// Los navegadores limitan el lado de un canvas (~16 000 px): en reportes muy largos se baja la resolución.
const MAX_CANVAS_SIDE = 15000;

function ratioFor(node: HTMLElement): number {
	const longest = Math.max(node.scrollHeight, node.scrollWidth, 1);
	return Math.max(0.75, Math.min(PIXEL_RATIO, MAX_CANVAS_SIDE / longest));
}

async function waitForPaint() {
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	if (document.fonts?.ready) await document.fonts.ready;
}

/** Dibuja la hoja del reporte fuera de pantalla y la captura como PNG. */
export async function renderPng(doc: ReportDoc): Promise<Blob> {
	const host = document.createElement("div");
	host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none";
	document.body.appendChild(host);
	const root = createRoot(host);
	try {
		root.render(<ReportSheet doc={doc} />);
		await waitForPaint();
		const node = host.firstElementChild as HTMLElement | null;
		if (!node) throw new Error("render_failed");
		const blob = await toBlob(node, { pixelRatio: ratioFor(node), backgroundColor: "#ffffff", cacheBust: true });
		if (!blob) throw new Error("render_failed");
		return blob;
	} finally {
		root.unmount();
		host.remove();
	}
}

/** Captura un elemento que ya está en pantalla (p. ej. el cronograma de limpieza). */
export async function captureElementPng(node: HTMLElement): Promise<Blob> {
	await waitForPaint();
	// Si el contenido es más ancho que su caja (scroll horizontal), se captura completo.
	const width = Math.max(node.scrollWidth, node.offsetWidth);
	const height = Math.max(node.scrollHeight, node.offsetHeight);
	const blob = await toBlob(node, {
		pixelRatio: PIXEL_RATIO,
		backgroundColor: "#ffffff",
		cacheBust: true,
		width,
		height,
		style: { overflow: "visible", maxWidth: "none", width: `${width}px` },
	});
	if (!blob) throw new Error("render_failed");
	return blob;
}
