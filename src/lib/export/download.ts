// Solo cliente: descarga de archivos generados.
import type { ExportFormat, ReportDoc } from "./types";

export function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "reporte";
}

const EXTENSION: Record<ExportFormat, string> = { docx: "docx", png: "png", xlsx: "xlsx" };

/** SVG → data URL PNG (con un canvas), para Word. */
async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
	const img = new Image();
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
	try {
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("svg_failed"));
			img.src = url;
		});
		const scale = 2;
		const canvas = document.createElement("canvas");
		canvas.width = width * scale;
		canvas.height = height * scale;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("svg_failed");
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/png");
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Convierte el ReportDoc al formato pedido (cargando las librerías solo cuando hacen falta) y lo descarga. */
export async function downloadReport(source: ReportDoc, format: ExportFormat) {
	let blob: Blob;
	// Los dibujos con mapa base reciben su fondo (el mapa que dibuja MapLibre) antes de generar el archivo.
	const doc = source.blocks.some((b) => b.type === "svg" && b.basemap)
		? await (await import("./basemap")).attachBasemaps(source)
		: source;
	if (format === "docx") {
		// Word no admite SVG: los dibujos se pasan a PNG.
		const blocks = await Promise.all(
			doc.blocks.map(async (b) =>
				b.type === "svg"
					? ({ type: "image", dataUrl: await svgToPngDataUrl(b.svg, b.width, b.height), width: b.width, height: b.height, caption: b.caption } as const)
					: b,
			),
		);
		blob = await (await import("./docx")).renderDocx({ ...doc, blocks });
	}
	else if (format === "xlsx") blob = (await import("./xlsx")).renderXlsx(doc);
	else blob = await (await import("./image")).renderPng(doc);
	downloadBlob(blob, `${safeFileName(doc.fileName)}.${EXTENSION[format]}`);
}
