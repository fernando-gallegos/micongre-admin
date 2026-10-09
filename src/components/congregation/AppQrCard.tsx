"use client";

import { Download, FileText } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { downloadBlob, safeFileName } from "@/lib/export/download";
import { captureElementPng } from "@/lib/export/image";
import { imageToPdf } from "@/lib/export/pdf";

/** QR (corrección de errores H, que tolera hasta ~30 % tapado) con el ícono de la app al centro: el ícono ocupa ~19 % del lado
 * (≈ 4 % del área) sobre un recuadro blanco, así que el código se lee igual. */
async function renderQrWithIcon(text: string): Promise<string> {
	const size = 720;
	const canvas = document.createElement("canvas");
	await QRCode.toCanvas(canvas, text, { width: size, margin: 1, errorCorrectionLevel: "H", color: { dark: "#1c1b17", light: "#ffffff" } });
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas.toDataURL("image/png");
	try {
		const icon = new Image();
		icon.src = "/logo.svg";
		await icon.decode();
		const box = Math.round(size * 0.22);
		const logo = Math.round(size * 0.18);
		const x = (size - box) / 2;
		ctx.fillStyle = "#ffffff";
		ctx.beginPath();
		ctx.roundRect(x, x, box, box, box * 0.22);
		ctx.fill();
		const lx = (size - logo) / 2;
		ctx.save();
		ctx.beginPath();
		ctx.roundRect(lx, lx, logo, logo, logo * 0.22);
		ctx.clip();
		ctx.drawImage(icon, lx, lx, logo, logo);
		ctx.restore();
	} catch {
		// Sin el ícono el QR sigue siendo válido.
	}
	return canvas.toDataURL("image/png");
}

/** Congregación → Código QR de la app: la app Android lo escanea para conectarse a este sitio. */
export function AppQrCard({ name, publicUrl }: { name: string; publicUrl?: string }) {
	const sheet = useRef<HTMLDivElement>(null);
	const [qr, setQr] = useState<string | null>(null);
	const [site, setSite] = useState("");
	const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	// Dirección que lleva el QR: la pública guardada en Congregación o, si no hay, la del sitio actual; nunca la interna del Worker.
	useEffect(() => {
		let origin = "";
		try {
			origin = publicUrl?.trim() ? new URL(publicUrl.trim()).origin : window.location.origin;
		} catch {
			origin = "";
		}
		if (!origin || new URL(origin).hostname.endsWith(".workers.dev")) {
			setSite("");
			setQr(null);
			return;
		}
		setSite(origin);
		let cancelled = false;
		renderQrWithIcon(origin)
			.then((url) => !cancelled && setQr(url))
			.catch(() => !cancelled && setQr(null));
		return () => {
			cancelled = true;
		};
	}, [publicUrl]);

	async function download(kind: "png" | "pdf") {
		if (!sheet.current) return;
		setBusy(kind);
		setMessage(null);
		try {
			const png = await captureElementPng(sheet.current);
			const base = safeFileName(`QR Mi Congre - ${name || "congregacion"}`);
			if (kind === "png") downloadBlob(png, `${base}.png`);
			else downloadBlob(await imageToPdf(png), `${base}.pdf`);
		} catch {
			setMessage("No se pudo generar el archivo. Intenta de nuevo.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<Card>
			<div className="flex flex-col items-center gap-4">
				{/* Hoja que se descarga: colores fijos para que no cambie con el modo oscuro. */}
				<div
					ref={sheet}
					style={{ width: 340, background: "#ffffff", color: "#1c1b17", padding: "28px 24px 24px", borderRadius: 16, textAlign: "center", fontFamily: "system-ui, sans-serif" }}
				>
					<div style={{ fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: "#6c6658", fontWeight: 600 }}>Mi Congre</div>
					<div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 16px", lineHeight: 1.2 }}>{name || "Mi congregación"}</div>
					{qr ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={qr} alt="Código QR de Mi Congre" style={{ width: 260, height: 260, display: "block", margin: "0 auto" }} />
					) : (
						<div style={{ width: 260, height: 260, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#6c6658" }}>
							{site ? "" : "Escribe la dirección pública de la app (en Datos generales) y guarda para generar el código."}
						</div>
					)}
					<div style={{ fontSize: 13, marginTop: 14, lineHeight: 1.4 }}>
						Abre la app <b>Mi Congre</b> y escanea este código para conectarte a tu congregación.
					</div>
					<div style={{ fontSize: 11, color: "#6c6658", marginTop: 8, wordBreak: "break-all" }}>{site}</div>
				</div>
				<div className="flex flex-wrap justify-center gap-2">
					<Button variant="secondary" onClick={() => download("png")} disabled={!qr || busy !== null}>
						<Download size={16} />
						{busy === "png" ? "Generando..." : "Descargar imagen"}
					</Button>
					<Button variant="secondary" onClick={() => download("pdf")} disabled={!qr || busy !== null}>
						<FileText size={16} />
						{busy === "pdf" ? "Generando..." : "Descargar PDF"}
					</Button>
				</div>
				{message && <p className="text-sm text-ink-soft">{message}</p>}
			</div>
		</Card>
	);
}
