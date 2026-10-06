"use client";

import type { CSSProperties } from "react";
import { getReportTheme, type ReportTheme } from "@/lib/export/themes";
import type { ReportDoc } from "@/lib/export/types";

/** Hoja del reporte (tamaño carta/A4 a 96 dpi): es lo que se convierte a imagen PNG.
 * Usa colores fijos (no los del tema de la app) para que el resultado no cambie con el modo oscuro;
 * el aspecto lo da el tema de reportes de la congregación (los formatos oficiales llevan el neutro). */
export const SHEET_WIDTH = { portrait: 794, landscape: 1123 } as const;

const PAD_X = 52;
const PAD_Y = 48;

function Title({ doc, theme }: { doc: ReportDoc; theme: ReportTheme }) {
	const title = doc.title;
	const sub = doc.subtitle;
	switch (theme.titleStyle) {
		case "band":
			return (
				<div style={{ margin: `-${PAD_Y}px -${PAD_X}px 26px`, padding: `30px ${PAD_X}px 24px`, background: theme.primary, borderBottom: `6px solid ${theme.accent}`, color: "#ffffff" }}>
					<h1 style={{ margin: 0, fontFamily: theme.headingFont, fontWeight: 700, fontSize: 30, letterSpacing: 0.2 }}>{title}</h1>
					{sub && <p style={{ margin: "6px 0 0", fontSize: 15, opacity: 0.85 }}>{sub}</p>}
				</div>
			);
		case "rule":
			return (
				<div style={{ margin: "0 0 26px" }}>
					<h1 style={{ margin: 0, fontFamily: theme.headingFont, fontWeight: 700, fontSize: 30, color: theme.dark }}>{title}</h1>
					<div style={{ height: 5, width: "100%", marginTop: 10, background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`, borderRadius: 3 }} />
					{sub && <p style={{ margin: "8px 0 0", fontSize: 15, color: theme.primary, fontWeight: 600 }}>{sub}</p>}
				</div>
			);
		case "badge":
			return (
				<div style={{ margin: "0 0 26px", textAlign: "center" }}>
					<div style={{ display: "inline-block", padding: "12px 32px", background: theme.soft, border: `2px solid ${theme.accent}`, borderRadius: 40 }}>
						<h1 style={{ margin: 0, fontFamily: theme.headingFont, fontWeight: 600, fontSize: 26, color: theme.dark }}>{title}</h1>
					</div>
					{sub && <p style={{ margin: "10px 0 0", fontSize: 15, color: theme.muted }}>{sub}</p>}
				</div>
			);
		case "stacked":
			return (
				<div style={{ margin: "0 0 26px" }}>
					<h1 style={{ margin: 0, fontFamily: theme.headingFont, fontWeight: 800, fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: theme.dark }}>{title}</h1>
					<div style={{ height: 4, width: 72, marginTop: 10, background: theme.accent }} />
					{sub && <p style={{ margin: "10px 0 0", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: theme.muted }}>{sub}</p>}
				</div>
			);
		default:
			return (
				<div style={{ margin: "0 0 24px", textAlign: "center" }}>
					<h1 style={{ margin: 0, fontFamily: theme.headingFont, fontWeight: 600, fontSize: 28, color: theme.dark }}>{title}</h1>
					{sub && <p style={{ margin: "6px 0 0", color: theme.muted, fontSize: 15 }}>{sub}</p>}
					{theme.id !== "plain" && <div style={{ height: 3, width: 90, margin: "12px auto 0", background: theme.accent, borderRadius: 2 }} />}
				</div>
			);
	}
}

export function ReportSheet({ doc }: { doc: ReportDoc }) {
	const theme = getReportTheme(doc.theme);
	const width = doc.landscape ? SHEET_WIDTH.landscape : SHEET_WIDTH.portrait;
	const themed = theme.id !== "plain";
	const headCell: CSSProperties = {
		border: `1px solid ${theme.border}`,
		background: theme.headerFill,
		color: theme.headerText,
		padding: "7px 9px",
		fontWeight: 700,
		textTransform: theme.upperHeaders ? "uppercase" : undefined,
		letterSpacing: theme.upperHeaders ? 0.6 : undefined,
		fontSize: theme.upperHeaders ? 11.5 : 13,
	};

	return (
		<div
			style={{
				width,
				boxSizing: "border-box",
				background: "#ffffff",
				color: theme.text,
				padding: `${PAD_Y}px ${PAD_X}px`,
				fontFamily: theme.bodyFont,
				fontSize: 14,
				lineHeight: 1.45,
				overflow: "hidden",
			}}
		>
			{!doc.bare && <Title doc={doc} theme={theme} />}

			{doc.blocks.map((b, i) => {
				switch (b.type) {
					case "heading":
						return (
							<h2
								key={i}
								style={{
									margin: "24px 0 9px",
									fontSize: b.level === 1 ? 22 : b.level === 3 ? 15 : 18,
									fontWeight: 700,
									fontFamily: theme.headingFont,
									color: themed ? theme.primary : theme.text,
									paddingBottom: themed ? 4 : 0,
									borderBottom: themed ? `2px solid ${theme.soft}` : undefined,
								}}
							>
								{b.text}
							</h2>
						);
					case "paragraph":
						return (
							<p key={i} style={{ margin: "0 0 8px", color: b.muted ? theme.muted : undefined, fontStyle: b.muted ? "italic" : undefined }}>
								{b.text}
							</p>
						);
					case "keyValue":
						return (
							<div
								key={i}
								style={{
									display: "grid",
									gridTemplateColumns: "35% 65%",
									rowGap: 5,
									margin: "0 0 16px",
									padding: themed ? "12px 16px" : 0,
									background: themed ? theme.soft : undefined,
									borderRadius: themed ? 10 : 0,
								}}
							>
								{b.items.map((item, j) => (
									<div key={j} style={{ display: "contents" }}>
										<div style={{ fontWeight: 700, color: themed ? theme.dark : undefined }}>{item.label}</div>
										<div>{item.value}</div>
									</div>
								))}
							</div>
						);
					case "table": {
						const total = b.table.columns.reduce((n, c) => n + (c.width ?? 1), 0) || 1;
						return (
							<div key={i} style={{ margin: "0 0 16px" }}>
								{b.caption && <div style={{ fontWeight: 700, margin: "6px 0 5px", color: themed ? theme.primary : undefined }}>{b.caption}</div>}
								<table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
									<thead>
										<tr>
											{b.table.columns.map((c, j) => (
												<th key={j} style={{ ...headCell, width: `${((c.width ?? 1) / total) * 100}%`, textAlign: c.align ?? "left" }}>
													{c.label}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{b.table.rows.map((row, r) => (
											<tr key={r} style={{ background: r % 2 === 1 ? theme.zebra : "#ffffff" }}>
												{b.table.columns.map((c, j) => (
													<td
														key={j}
														style={{
															border: `1px solid ${theme.border}`,
															padding: "6px 9px",
															textAlign: c.align ?? "left",
															verticalAlign: "top",
															whiteSpace: "pre-line",
															wordBreak: "break-word",
														}}
													>
														{row[j] ?? ""}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						);
					}
					case "image":
						return (
							<div key={i} style={{ textAlign: "center", margin: "10px 0" }}>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={b.dataUrl} alt={b.caption ?? ""} style={{ maxWidth: "100%", width: b.width, height: "auto" }} />
								{b.caption && <div style={{ fontSize: 12, color: theme.muted }}>{b.caption}</div>}
							</div>
						);
					case "svg":
						return (
							<div key={i} style={{ textAlign: "center", margin: "10px 0" }}>
								<div
									style={{ display: "inline-block", maxWidth: "100%", borderRadius: themed ? 10 : 0, overflow: "hidden" }}
									dangerouslySetInnerHTML={{ __html: b.svg }}
								/>
								{b.caption && <div style={{ fontSize: 12, color: theme.muted }}>{b.caption}</div>}
							</div>
						);
					case "pageBreak":
						return <div key={i} style={{ height: 24 }} />;
				}
			})}

			{doc.footer && !doc.bare && (
				<p
					style={{
						margin: "28px 0 0",
						paddingTop: 10,
						textAlign: "center",
						fontSize: 11,
						color: theme.muted,
						borderTop: themed ? `2px solid ${theme.soft}` : undefined,
					}}
				>
					{doc.footer}
				</p>
			)}
		</div>
	);
}
