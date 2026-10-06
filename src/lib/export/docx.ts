// Solo cliente: ReportDoc → archivo Word (.docx), con el tema de reportes de la congregación.
import {
	AlignmentType,
	BorderStyle,
	Document,
	Footer,
	HeadingLevel,
	ImageRun,
	Packer,
	PageOrientation,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType,
} from "docx";
import { getReportTheme, type ReportTheme } from "./themes";
import type { ReportBlock, ReportDoc, ReportTable } from "./types";

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

const hex = (color: string) => color.replace("#", "").toUpperCase();

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const base64 = dataUrl.split(",")[1] ?? "";
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

interface RunOpts {
	bold?: boolean;
	size?: number;
	color?: string;
	italics?: boolean;
	heading?: boolean;
	caps?: boolean;
	spacing?: number;
}

function makeText(theme: ReportTheme) {
	return (value: string, o: RunOpts = {}) =>
		new TextRun({
			text: value,
			font: o.heading ? theme.docxHeadingFont : theme.docxBodyFont,
			bold: o.bold,
			size: o.size ?? 22,
			color: o.color ? hex(o.color) : undefined,
			italics: o.italics,
			allCaps: o.caps,
			characterSpacing: o.spacing,
		});
}

function cellText(value: string | number | null): string {
	return value === null || value === undefined ? "" : String(value);
}

function titleParagraphs(doc: ReportDoc, theme: ReportTheme, t: ReturnType<typeof makeText>): Paragraph[] {
	const out: Paragraph[] = [];
	const heading = HeadingLevel.TITLE;
	switch (theme.titleStyle) {
		case "band":
			out.push(
				new Paragraph({
					heading,
					spacing: { before: 0, after: 40 },
					shading: { type: ShadingType.CLEAR, fill: hex(theme.primary), color: "auto" },
					border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: hex(theme.accent), space: 4 } },
					children: [t(`  ${doc.title}`, { bold: true, size: 40, color: "#FFFFFF", heading: true })],
				}),
			);
			if (doc.subtitle) out.push(new Paragraph({ spacing: { after: 240 }, children: [t(doc.subtitle, { size: 22, color: theme.muted })] }));
			break;
		case "rule":
			out.push(
				new Paragraph({
					heading,
					spacing: { after: 60 },
					border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: hex(theme.primary), space: 4 } },
					children: [t(doc.title, { bold: true, size: 40, color: theme.dark, heading: true })],
				}),
			);
			if (doc.subtitle) out.push(new Paragraph({ spacing: { before: 80, after: 240 }, children: [t(doc.subtitle, { bold: true, size: 23, color: theme.primary })] }));
			break;
		case "badge":
			out.push(
				new Paragraph({
					heading,
					alignment: AlignmentType.CENTER,
					spacing: { after: 80 },
					shading: { type: ShadingType.CLEAR, fill: hex(theme.soft), color: "auto" },
					border: {
						top: { style: BorderStyle.SINGLE, size: 12, color: hex(theme.accent), space: 6 },
						bottom: { style: BorderStyle.SINGLE, size: 12, color: hex(theme.accent), space: 6 },
					},
					children: [t(doc.title, { bold: true, size: 36, color: theme.dark, heading: true })],
				}),
			);
			if (doc.subtitle) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 240 }, children: [t(doc.subtitle, { size: 22, color: theme.muted })] }));
			break;
		case "stacked":
			out.push(
				new Paragraph({
					heading,
					spacing: { after: 60 },
					border: { bottom: { style: BorderStyle.SINGLE, size: 20, color: hex(theme.accent), space: 4 } },
					children: [t(doc.title, { bold: true, size: 34, color: theme.dark, heading: true, caps: true, spacing: 40 })],
				}),
			);
			if (doc.subtitle) out.push(new Paragraph({ spacing: { before: 80, after: 240 }, children: [t(doc.subtitle, { size: 20, color: theme.muted, caps: true, spacing: 30 })] }));
			break;
		default:
			out.push(
				new Paragraph({
					heading,
					alignment: AlignmentType.CENTER,
					spacing: { after: 80 },
					children: [t(doc.title, { bold: true, size: 36, color: theme.dark, heading: true })],
				}),
			);
			if (doc.subtitle) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [t(doc.subtitle, { size: 22, color: theme.muted })] }));
	}
	return out;
}

function tableBlock(tbl: ReportTable, theme: ReportTheme, t: ReturnType<typeof makeText>): Table {
	const total = tbl.columns.reduce((n, c) => n + (c.width ?? 1), 0) || 1;
	const align = (a?: string) => (a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT);
	const edge = { style: BorderStyle.SINGLE, size: 4, color: hex(theme.border) } as const;
	const borders = { top: edge, bottom: edge, left: edge, right: edge };

	const header = new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: tbl.columns.map(
			(c) =>
				new TableCell({
					borders,
					width: { size: ((c.width ?? 1) / total) * 100, type: WidthType.PERCENTAGE },
					shading: { type: ShadingType.CLEAR, fill: hex(theme.headerFill), color: "auto" },
					margins: { top: 70, bottom: 70, left: 110, right: 110 },
					children: [
						new Paragraph({
							alignment: align(c.align),
							children: [t(c.label, { bold: true, size: theme.upperHeaders ? 18 : 20, color: theme.headerText, caps: theme.upperHeaders, spacing: theme.upperHeaders ? 12 : undefined })],
						}),
					],
				}),
		),
	});

	const body = tbl.rows.map(
		(row, r) =>
			new TableRow({
				cantSplit: true,
				children: tbl.columns.map(
					(c, i) =>
						new TableCell({
							borders,
							width: { size: ((c.width ?? 1) / total) * 100, type: WidthType.PERCENTAGE },
							shading: r % 2 === 1 ? { type: ShadingType.CLEAR, fill: hex(theme.zebra), color: "auto" } : undefined,
							margins: { top: 55, bottom: 55, left: 110, right: 110 },
							children: cellText(row[i] ?? null)
								.split("\n")
								.map((line) => new Paragraph({ alignment: align(c.align), children: [t(line, { size: 20, color: theme.text })] })),
						}),
				),
			}),
	);

	return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
}

function blocks(doc: ReportDoc, theme: ReportTheme): (Paragraph | Table)[] {
	const t = makeText(theme);
	const themed = theme.id !== "plain";
	const out: (Paragraph | Table)[] = doc.bare ? [] : titleParagraphs(doc, theme, t);

	for (const b of doc.blocks as ReportBlock[]) {
		switch (b.type) {
			case "heading":
				out.push(
					new Paragraph({
						heading: b.level === 3 ? HeadingLevel.HEADING_3 : b.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
						spacing: { before: 280, after: 100 },
						border: themed ? { bottom: { style: BorderStyle.SINGLE, size: 8, color: hex(theme.accent), space: 2 } } : undefined,
						children: [
							t(b.text, {
								bold: true,
								size: b.level === 1 ? 30 : b.level === 3 ? 22 : 26,
								color: themed ? theme.primary : theme.text,
								heading: true,
							}),
						],
					}),
				);
				break;
			case "paragraph":
				out.push(
					new Paragraph({
						spacing: { after: 100 },
						children: [t(b.text, { color: b.muted ? theme.muted : theme.text, italics: b.muted })],
					}),
				);
				break;
			case "keyValue": {
				const shade = themed ? { type: ShadingType.CLEAR, fill: hex(theme.soft), color: "auto" } : undefined;
				out.push(
					new Table({
						width: { size: 100, type: WidthType.PERCENTAGE },
						rows: b.items.map(
							(item) =>
								new TableRow({
									children: [
										new TableCell({
											borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
											width: { size: 35, type: WidthType.PERCENTAGE },
											shading: shade,
											margins: { top: 50, bottom: 50, left: 140, right: 60 },
											children: [new Paragraph({ children: [t(item.label, { bold: true, size: 21, color: themed ? theme.dark : theme.text })] })],
										}),
										new TableCell({
											borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
											width: { size: 65, type: WidthType.PERCENTAGE },
											shading: shade,
											margins: { top: 50, bottom: 50, left: 60, right: 140 },
											children: [new Paragraph({ children: [t(item.value, { size: 21, color: theme.text })] })],
										}),
									],
								}),
						),
					}),
					new Paragraph({ children: [] }),
				);
				break;
			}
			case "table":
				if (b.caption) {
					out.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [t(b.caption, { bold: true, size: 21, color: themed ? theme.primary : theme.text })] }));
				}
				out.push(tableBlock(b.table, theme, t), new Paragraph({ spacing: { after: 120 }, children: [] }));
				break;
			case "image":
				out.push(
					new Paragraph({
						alignment: AlignmentType.CENTER,
						children: [
							new ImageRun({
								type: "png",
								data: dataUrlToBytes(b.dataUrl),
								transformation: { width: Math.min(b.width, 600), height: Math.round((Math.min(b.width, 600) / b.width) * b.height) },
							}),
						],
					}),
				);
				if (b.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [t(b.caption, { size: 18, color: theme.muted })] }));
				break;
			case "pageBreak":
				out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
				break;
		}
	}
	return out;
}

export async function renderDocx(doc: ReportDoc): Promise<Blob> {
	const theme = getReportTheme(doc.theme);
	const t = makeText(theme);
	const document = new Document({
		creator: "Mi Congre",
		title: doc.title,
		sections: [
			{
				properties: {
					page: {
						size: { orientation: doc.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
						margin: { top: 900, bottom: 900, left: 900, right: 900 },
					},
				},
				footers: doc.footer && !doc.bare
					? {
							default: new Footer({
								children: [
									new Paragraph({
										alignment: AlignmentType.CENTER,
										border: theme.id !== "plain" ? { top: { style: BorderStyle.SINGLE, size: 8, color: hex(theme.accent), space: 4 } } : undefined,
										children: [t(doc.footer, { size: 16, color: theme.muted })],
									}),
								],
							}),
						}
					: undefined,
				children: blocks(doc, theme),
			},
		],
	});
	return Packer.toBlob(document);
}
