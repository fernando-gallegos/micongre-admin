// Solo cliente: ReportDoc → archivo Excel (.xlsx) sin dependencias extra (zip con fflate).
// Cada tabla del reporte es una hoja; un keyValue o párrafo suelto no se exporta.
import { strToU8, zipSync } from "fflate";
import { getReportTheme, type ReportTheme } from "./themes";
import type { Cell, ReportDoc, ReportTable } from "./types";

function esc(value: string): string {
	// Caracteres de control no válidos en XML 1.0 y los 5 especiales.
	return value
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function colName(index: number): string {
	let n = index + 1;
	let s = "";
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}

function cellXml(ref: string, value: Cell, style: number): string {
	if (value === null || value === undefined || value === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
	if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
	return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
}

function sheetXml(t: ReportTable): string {
	const widths = t.columns.map((c, i) => {
		const longest = Math.max(c.label.length, ...t.rows.map((r) => String(r[i] ?? "").split("\n").reduce((m, l) => Math.max(m, l.length), 0)));
		const w = Math.min(60, Math.max(8, Math.round(longest * 1.15) + 2));
		return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
	});
	const header = `<row r="1">${t.columns.map((c, i) => cellXml(`${colName(i)}1`, c.label, 1)).join("")}</row>`;
	const rows = t.rows.map((row, r) => {
		const cells = t.columns.map((_, i) => cellXml(`${colName(i)}${r + 2}`, row[i] ?? null, r % 2 === 1 ? 3 : 2)).join("");
		return `<row r="${r + 2}">${cells}</row>`;
	});
	return (
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
		`<cols>${widths.join("")}</cols><sheetData>${header}${rows.join("")}</sheetData></worksheet>`
	);
}

const argb = (color: string) => `FF${color.replace("#", "").toUpperCase()}`;

function stylesXml(theme: ReportTheme): string {
	return (
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="${argb(theme.headerText)}"/><name val="Calibri"/></font></fonts>` +
		`<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
		`<fill><patternFill patternType="solid"><fgColor rgb="${argb(theme.headerFill)}"/><bgColor indexed="64"/></patternFill></fill>` +
		`<fill><patternFill patternType="solid"><fgColor rgb="${argb(theme.zebra)}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
		`<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
		`<border><left style="thin"><color rgb="${argb(theme.border)}"/></left><right style="thin"><color rgb="${argb(theme.border)}"/></right><top style="thin"><color rgb="${argb(theme.border)}"/></top><bottom style="thin"><color rgb="${argb(theme.border)}"/></bottom><diagonal/></border></borders>` +
		`<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
		`<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
		`<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
		`<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
		`<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>` +
		`</styleSheet>`
	);
}

/** Nombre de hoja válido en Excel: ≤31 caracteres, sin : \ / ? * [ ], único. */
function sheetNames(tables: ReportTable[]): string[] {
	const used = new Set<string>();
	return tables.map((t, i) => {
		let name = (t.sheetName ?? `Hoja ${i + 1}`).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || `Hoja ${i + 1}`;
		let n = 2;
		while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${n++}`;
		used.add(name.toLowerCase());
		return name;
	});
}

export function renderXlsx(doc: ReportDoc): Blob {
	const tables: ReportTable[] = [];
	let lastHeading = "";
	for (const b of doc.blocks) {
		if (b.type === "heading") lastHeading = b.text;
		if (b.type === "table") tables.push({ ...b.table, sheetName: b.table.sheetName ?? (b.caption || lastHeading || undefined) });
	}
	if (tables.length === 0) throw new Error("no_tables");
	const names = sheetNames(tables);

	const files: Record<string, Uint8Array> = {
		"[Content_Types].xml": strToU8(
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
				`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
				`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
				`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
				tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
				`</Types>`,
		),
		"_rels/.rels": strToU8(
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
		),
		"xl/workbook.xml": strToU8(
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
				names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
				`</sheets></workbook>`,
		),
		"xl/_rels/workbook.xml.rels": strToU8(
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
				tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
				`<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
		),
		"xl/styles.xml": strToU8(stylesXml(getReportTheme(doc.theme))),
	};
	tables.forEach((t, i) => {
		files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(t));
	});

	return new Blob([zipSync(files) as BlobPart], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
}
