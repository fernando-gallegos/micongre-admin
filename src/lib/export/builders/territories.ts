import { and, desc, eq } from "drizzle-orm";
import { territories, territoryAssignments, users } from "@/db/schema";
import { formatShortDate } from "@/lib/dateFormat";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAccessTerritoriesModule, canAccessTerritoriesModule } from "@/lib/rbac/guards";
import { listTerritories } from "@/lib/territories/service";
import { TERRITORY_KIND_LABEL, boundsOf, parseMapData, type LngLat, type TerritoryMapData } from "@/lib/territories/geo";
import type { BuilderContext } from "../registry";
import type { ReportBlock, ReportDoc } from "../types";

const STATUS_LABEL = { assigned: "Asignado", completed: "Completado", returned: "Devuelto" } as const;

const WORLD = 512; // px del mundo a zoom 0 (MapLibre)
const MARGIN = 28;

function esc(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const invMercY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

interface Sketch {
	/** Elementos SVG del dibujo, en coordenadas de un lienzo W×H (sin fondo). */
	parts: string[];
	basemap: { center: [number, number]; zoom: number };
}

/** Dibujo del territorio proyectado como el mapa base (Web Mercator, con el mismo centro y zoom que dibujará
 * el navegador de fondo) sobre un lienzo de W×H px. */
function sketchParts(data: TerritoryMapData, W: number, H: number, margin = MARGIN): Sketch | null {
	const bounds = boundsOf(data);
	if (!bounds) return null;
	const [w, s, e, n] = bounds;
	const availW = W - margin * 2;
	const availH = H - margin * 2;
	const dx = mercX(e) - mercX(w);
	const dy = mercY(s) - mercY(n);
	// Un dibujo de un solo punto (o casi) no se amplía sin límite.
	const fit = Math.min(dx > 1e-9 ? availW / (WORLD * dx) : Infinity, dy > 1e-9 ? availH / (WORLD * dy) : Infinity);
	const zoom = Math.max(1, Math.min(17.5, Number.isFinite(fit) ? Math.log2(fit) : 17));
	const centerX = (mercX(w) + mercX(e)) / 2;
	const centerY = (mercY(s) + mercY(n)) / 2;
	const centerLng = centerX * 360 - 180;
	const centerLat = invMercY(centerY);
	const worldSize = WORLD * 2 ** zoom;
	const px = ([lng]: LngLat) => W / 2 + (mercX(lng) - centerX) * worldSize;
	const py = ([, lat]: LngLat) => H / 2 + (mercY(lat) - centerY) * worldSize;
	const pt = (c: LngLat) => `${px(c).toFixed(1)},${py(c).toFixed(1)}`;

	const polygons: string[] = [];
	const lines: string[] = [];
	const points: string[] = [];
	const texts: string[] = [];
	for (const f of data.features) {
		const g = f.geometry;
		if (g.type === "Polygon") {
			const d = g.coordinates.map((ring) => `M${ring.map(pt).join(" L")} Z`).join(" ");
			polygons.push(
				`<path d="${d}" fill="#e11d48" fill-opacity="0.2" stroke="#e11d48" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>`,
			);
		} else if (g.type === "LineString") {
			lines.push(
				`<polyline points="${g.coordinates.map(pt).join(" ")}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
			);
		} else if (f.properties?.kind === "text") {
			const label = f.properties.text ?? "";
			if (label) {
				const [x, y] = pt(g.coordinates).split(",");
				texts.push(
					`<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111827" stroke="#ffffff" stroke-width="4" paint-order="stroke">${esc(label)}</text>`,
				);
			}
		} else {
			const [x, y] = pt(g.coordinates).split(",");
			const emoji = f.properties?.emoji;
			if (emoji) {
				points.push(
					`<text x="${x}" y="${(Number(y) + 9).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="26">${esc(emoji)}</text>`,
				);
			} else {
				points.push(`<circle cx="${x}" cy="${y}" r="8" fill="#2563eb" stroke="#ffffff" stroke-width="3"/>`);
			}
		}
	}
	const parts: string[] = [...polygons, ...lines, ...points, ...texts];

	// Escala: una barra de longitud «redonda» de a lo sumo ~1/3 del ancho.
	const mPerPx = (40_075_016.686 * Math.cos((centerLat * Math.PI) / 180)) / worldSize;
	const maxMeters = (W / 3) * mPerPx;
	const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter((v) => v <= maxMeters).pop();
	if (nice && mPerPx > 0 && Number.isFinite(mPerPx)) {
		const len = nice / mPerPx;
		const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
		const x0 = 16;
		const y0 = H - 16;
		parts.push(
			`<rect x="${x0 - 6}" y="${y0 - 24}" width="${len + 12}" height="30" fill="#ffffff" fill-opacity="0.8"/>`,
			`<path d="M${x0},${y0 - 5} L${x0},${y0} L${x0 + len},${y0} L${x0 + len},${y0 - 5}" fill="none" stroke="#374151" stroke-width="1.5"/>`,
			`<text x="${x0 + len / 2}" y="${y0 - 8}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#374151">${label}</text>`,
		);
	}
	return { parts, basemap: { center: [centerLng, centerLat], zoom } };
}

/** Dibujo suelto (reporte de una asignación). El primer <rect> es el fondo liso: el navegador pone el mapa encima. */
function buildSketchSvg(data: TerritoryMapData, W: number, H: number) {
	const sketch = sketchParts(data, W, H);
	if (!sketch) return null;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f4f1ea"/>${sketch.parts.join("")}</svg>`;
	return { svg, caption: "Mapa © colaboradores de OpenStreetMap · OpenFreeMap", basemap: sketch.basemap };
}

// --- Tarjeta S-12: «Tarjeta del mapa del territorio» ---------------------------------

const CARD_W = 690;
const CARD_H = 480;
const CARD_PAD = 24;
const FONT = "Arial, Helvetica, sans-serif";
const S12_FOOTER = [
	"Sírvase mantener esta tarjeta en el sobre. No la manche, marque, ni doble. Cada vez que",
	"se haya trabajado completamente el territorio, infórmelo al hermano que atiende los",
	"archivos del territorio.",
];

/** Tarjeta oficial S-12 de un territorio: localidad, número, mapa y las indicaciones al pie. */
function buildS12Card(number: string, locality: string, data: TerritoryMapData | null): { svg: string; basemap?: { center: [number, number]; zoom: number; rect: { x: number; y: number; width: number; height: number } } } {
	const mapRect = { x: CARD_PAD, y: 92, width: CARD_W - CARD_PAD * 2, height: 300 };
	const sketch = data ? sketchParts(data, mapRect.width, mapRect.height, 60) : null;

	const head: string[] = [];
	head.push(`<rect width="${CARD_W}" height="${CARD_H}" fill="#ffffff"/>`);
	head.push(`<rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" fill="none" stroke="#111827" stroke-width="1.5"/>`);
	head.push(
		`<text x="${CARD_PAD}" y="40" font-family="${FONT}" font-size="22" font-weight="bold" fill="#111827">Tarjeta del mapa del territorio</text>`,
	);
	// Localidad ........ Terr. núm. ........
	const lineY = 74;
	const numX = CARD_W - CARD_PAD - 150;
	head.push(`<text x="${CARD_PAD}" y="${lineY}" font-family="${FONT}" font-size="13" fill="#111827">Localidad</text>`);
	head.push(`<line x1="${CARD_PAD + 62}" y1="${lineY + 2}" x2="${numX - 70}" y2="${lineY + 2}" stroke="#111827" stroke-width="1" stroke-dasharray="1.5 2.5"/>`);
	head.push(
		`<text x="${CARD_PAD + 66}" y="${lineY - 2}" font-family="${FONT}" font-size="15" font-weight="bold" fill="#111827">${esc(locality.slice(0, 48))}</text>`,
	);
	head.push(`<text x="${numX - 64}" y="${lineY}" font-family="${FONT}" font-size="13" fill="#111827">Terr. núm.</text>`);
	head.push(`<line x1="${numX}" y1="${lineY + 2}" x2="${CARD_W - CARD_PAD}" y2="${lineY + 2}" stroke="#111827" stroke-width="1" stroke-dasharray="1.5 2.5"/>`);
	head.push(
		`<text x="${numX + 6}" y="${lineY - 2}" font-family="${FONT}" font-size="17" font-weight="bold" fill="#111827">${esc(number.slice(0, 12))}</text>`,
	);

	// Área del mapa: fondo liso (el navegador pone el mapa base encima) y el dibujo recortado a su marco.
	const body: string[] = [];
	body.push(`<rect id="basemap-bg" x="${mapRect.x}" y="${mapRect.y}" width="${mapRect.width}" height="${mapRect.height}" fill="#f4f1ea"/>`);
	if (sketch) {
		body.push(
			`<clipPath id="mapclip"><rect x="0" y="0" width="${mapRect.width}" height="${mapRect.height}"/></clipPath>`,
			`<g transform="translate(${mapRect.x} ${mapRect.y})"><g clip-path="url(#mapclip)">${sketch.parts.join("")}</g></g>`,
		);
	} else {
		body.push(
			`<text x="${mapRect.x + mapRect.width / 2}" y="${mapRect.y + mapRect.height / 2}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#6c6658">(Pegue el mapa arriba o dibuje el territorio)</text>`,
		);
	}
	body.push(`<rect x="${mapRect.x}" y="${mapRect.y}" width="${mapRect.width}" height="${mapRect.height}" fill="none" stroke="#111827" stroke-width="1.2"/>`);

	const foot: string[] = S12_FOOTER.map(
		(line, i) =>
			`<text x="${CARD_PAD}" y="${418 + i * 15}" font-family="${FONT}" font-size="11" fill="#111827">${esc(line)}</text>`,
	);
	foot.push(`<text x="${CARD_PAD}" y="${CARD_H - 12}" font-family="${FONT}" font-size="9" fill="#6c6658">S-12-S   6/72</text>`);
	if (sketch) {
		foot.push(
			`<text x="${CARD_W - CARD_PAD}" y="${CARD_H - 12}" text-anchor="end" font-family="${FONT}" font-size="9" fill="#6c6658">Mapa © colaboradores de OpenStreetMap · OpenFreeMap</text>`,
		);
	}

	// La imagen del mapa se inserta tras el primer <rect> (fondo de la tarjeta) y queda bajo el resto.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${[...head, ...body, ...foot].join("")}</svg>`;
	return { svg, basemap: sketch ? { ...sketch.basemap, rect: mapRect } : undefined };
}

/** Tarjetas de territorio en el formato oficial S-12: primero los generales y luego los de predicación
 * pública, una tarjeta por territorio (dos por página). */
async function buildTerritoryCards({ db, session }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessTerritoriesModule(session);
	const [items, mapRows] = await Promise.all([
		listTerritories(db),
		db.select({ id: territories.id, mapData: territories.mapData }).from(territories),
	]);
	const mapById = new Map(mapRows.map((r) => [r.id, r.mapData]));

	const blocks: ReportBlock[] = [];
	const sections: { title: string; kind: "general" | "public_preaching" }[] = [
		{ title: "Territorios generales", kind: "general" },
		{ title: "Predicación pública", kind: "public_preaching" },
	];
	let count = 0;
	for (const section of sections) {
		const list = items.filter((t) => t.kind === section.kind);
		if (list.length === 0) continue;
		if (blocks.length > 0) blocks.push({ type: "pageBreak" });
		blocks.push({ type: "heading", text: section.title, level: 1 });
		list.forEach((t, i) => {
			if (i > 0 && i % 2 === 0) blocks.push({ type: "pageBreak" });
			count++;
			const card = buildS12Card(t.number, t.name ?? "", parseMapData(mapById.get(t.id) ?? null));
			blocks.push({ type: "svg", svg: card.svg, width: CARD_W, height: CARD_H, basemap: card.basemap });
		});
	}
	if (count === 0) blocks.push({ type: "paragraph", text: "Todavía no hay territorios.", muted: true });

	return {
		title: "Tarjetas del mapa del territorio (S-12)",
		subtitle: `${count} territorios`,
		fileName: "tarjetas-de-territorio",
		blocks,
		footer: "Mi Congre",
	};
}

export async function buildTerritories(ctx: BuilderContext): Promise<ReportDoc> {
	if (ctx.params.get("kind") === "territories-cards") return buildTerritoryCards(ctx);
	return buildAssignmentReport(ctx);
}

async function buildAssignmentReport({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	const assignmentId = params.get("assignmentId");
	const territoryId = params.get("territoryId");
	if (!assignmentId && !territoryId) throw new Error("missing_param");

	const rows = await db
		.select({
			id: territoryAssignments.id,
			territoryId: territories.id,
			number: territories.number,
			name: territories.name,
			kind: territories.kind,
			notes: territories.notes,
			mapData: territories.mapData,
			assigneeUserId: territoryAssignments.assigneeUserId,
			assigneeName: users.fullName,
			assignedAt: territoryAssignments.assignedAt,
			status: territoryAssignments.status,
			resolvedAt: territoryAssignments.resolvedAt,
			resolutionComment: territoryAssignments.resolutionComment,
		})
		.from(territoryAssignments)
		.innerJoin(territories, eq(territories.id, territoryAssignments.territoryId))
		.innerJoin(users, eq(users.id, territoryAssignments.assigneeUserId))
		.where(
			assignmentId
				? eq(territoryAssignments.id, assignmentId)
				: and(eq(territoryAssignments.territoryId, territoryId as string), eq(territoryAssignments.status, "assigned")),
		)
		.orderBy(desc(territoryAssignments.assignedAt))
		.limit(1);
	const row = rows[0];
	if (!row) throw new RbacError("No hay una asignación para este territorio.");

	if (!canAccessTerritoriesModule(session) && row.assigneeUserId !== session.userId) {
		throw new RbacError("No tienes acceso a este territorio.");
	}

	const title = `Territorio ${row.number}${row.name ? ` — ${row.name}` : ""}`;
	const items: { label: string; value: string }[] = [
		{ label: "Tipo", value: TERRITORY_KIND_LABEL[row.kind] },
		{ label: "Encargado", value: row.assigneeName },
		{ label: "Fecha de asignación", value: formatShortDate(row.assignedAt) },
		{ label: "Estado", value: STATUS_LABEL[row.status] },
	];
	if (row.resolvedAt) {
		items.push({ label: row.status === "returned" ? "Fecha de devolución" : "Fecha de conclusión", value: formatShortDate(row.resolvedAt) });
	}
	if (row.resolutionComment) items.push({ label: "Comentario", value: row.resolutionComment });
	if (row.notes) items.push({ label: "Notas", value: row.notes });

	const blocks: ReportBlock[] = [{ type: "keyValue", items }];
	const sketch = buildSketchSvg(parseMapData(row.mapData) ?? { type: "FeatureCollection", features: [] }, 560, 420);
	if (sketch) {
		blocks.push({ type: "heading", text: "Mapa", level: 2 });
		blocks.push({ type: "svg", svg: sketch.svg, width: 560, height: 420, caption: sketch.caption, basemap: sketch.basemap });
	} else {
		blocks.push({ type: "paragraph", text: "Este territorio todavía no tiene mapa.", muted: true });
	}

	return {
		title,
		subtitle: TERRITORY_KIND_LABEL[row.kind],
		fileName: `territorio-${row.number}`,
		blocks,
		footer: "Mi Congre",
	};
}
