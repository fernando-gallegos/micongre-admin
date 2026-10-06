// Solo cliente: dibuja el mapa base (el mismo estilo gratuito de OpenFreeMap que usa la app, sin
// nombres de lugares) en un canvas fuera de pantalla y lo pone de fondo de los dibujos SVG de un reporte.
import { getBaseMapStyle } from "@/lib/territories/mapStyle";
import type { ReportBlock, ReportDoc } from "./types";

type Basemap = NonNullable<Extract<ReportBlock, { type: "svg" }>["basemap"]>;

const TIMEOUT_MS = 30_000;

async function renderBasemap(width: number, height: number, view: Basemap): Promise<string | null> {
	const [maplibre, style] = await Promise.all([import("maplibre-gl"), getBaseMapStyle()]);
	const container = document.createElement("div");
	container.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px`;
	document.body.appendChild(container);
	let map: InstanceType<typeof maplibre.Map> | null = null;
	try {
		map = new maplibre.Map({
			container,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			style: style as any,
			center: view.center,
			zoom: view.zoom,
			interactive: false,
			attributionControl: false,
			fadeDuration: 0,
			canvasContextAttributes: { preserveDrawingBuffer: true },
			pixelRatio: 2,
		});
		const m = map;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, TIMEOUT_MS);
			m.once("idle", () => {
				clearTimeout(timer);
				resolve();
			});
		});
		// Si se agotó el tiempo se usa lo que alcanzó a dibujarse (los huecos quedan con el fondo liso).
		return m.getCanvas().toDataURL("image/png");
	} catch {
		return null;
	} finally {
		map?.remove();
		container.remove();
	}
}

/** Inserta el mapa base como imagen al fondo de cada SVG que lo pida (si falla, queda el fondo liso). */
export async function attachBasemaps(doc: ReportDoc): Promise<ReportDoc> {
	// De uno en uno: cada mapa es un contexto WebGL y el navegador limita cuántos puede tener abiertos.
	const blocks: ReportBlock[] = [];
	for (const b of doc.blocks) {
		if (b.type !== "svg" || !b.basemap) {
			blocks.push(b);
			continue;
		}
		const area = b.basemap.rect ?? { x: 0, y: 0, width: b.width, height: b.height };
		const dataUrl = await renderBasemap(area.width, area.height, b.basemap);
		if (!dataUrl) {
			blocks.push(b);
			continue;
		}
		const image = `<image href="${dataUrl}" x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" preserveAspectRatio="none"/>`;
		// El mapa va encima del fondo liso (el <rect id="basemap-bg"> si existe; si no, el primer <rect>), que se
		// ve donde el mapa no alcanzó a cargar.
		const marked = /<rect id="basemap-bg"[^>]*\/>/.exec(b.svg);
		const svg = marked
			? b.svg.replace(marked[0], `${marked[0]}${image}`)
			: b.svg.replace(/(<svg[^>]*>)(<rect[^>]*\/>)?/, (_m, open: string, rect?: string) => `${open}${rect ?? ""}${image}`);
		blocks.push({ ...b, svg });
	}
	return { ...doc, blocks };
}
