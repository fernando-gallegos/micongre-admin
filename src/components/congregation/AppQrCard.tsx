"use client";

import { Download, FileText } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { downloadBlob, safeFileName } from "@/lib/export/download";
import { captureElementPng } from "@/lib/export/image";
import { imageToPdf } from "@/lib/export/pdf";

/** Congregación → Código QR de la app: la app Android lo escanea para conectarse a este sitio. */
export function AppQrCard({ name }: { name: string }) {
	const sheet = useRef<HTMLDivElement>(null);
	const [qr, setQr] = useState<string | null>(null);
	const [site, setSite] = useState("");
	const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		const origin = window.location.origin;
		setSite(origin);
		QRCode.toDataURL(origin, { width: 720, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1b17", light: "#ffffff" } })
			.then(setQr)
			.catch(() => setQr(null));
	}, []);

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
						<div style={{ width: 260, height: 260, margin: "0 auto" }} />
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
