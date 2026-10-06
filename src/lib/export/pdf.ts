// Solo cliente: una imagen (PNG) → PDF de una página, sin dependencias (la imagen va como JPEG dentro del PDF).

async function pngToJpeg(png: Blob): Promise<{ bytes: Uint8Array; width: number; height: number }> {
	const bitmap = await createImageBitmap(png);
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("render_failed");
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(bitmap, 0, 0);
	const jpeg: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
	if (!jpeg) throw new Error("render_failed");
	return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
}

/** PDF tamaño carta con la imagen centrada arriba, a un ancho de `widthPt` puntos. */
export async function imageToPdf(png: Blob, widthPt = 420): Promise<Blob> {
	const { bytes, width, height } = await pngToJpeg(png);
	const pageW = 612;
	const pageH = 792;
	const w = widthPt;
	const h = (height / width) * w;
	const x = (pageW - w) / 2;
	const y = pageH - 60 - h;

	const enc = new TextEncoder();
	const chunks: Uint8Array[] = [];
	const offsets: number[] = [];
	let length = 0;
	const push = (data: Uint8Array | string) => {
		const b = typeof data === "string" ? enc.encode(data) : data;
		chunks.push(b);
		length += b.length;
	};
	const object = (n: number, body: string, stream?: Uint8Array) => {
		offsets[n] = length;
		push(`${n} 0 obj\n${body}\n`);
		if (stream) {
			push("stream\n");
			push(stream);
			push("\nendstream\n");
		}
		push("endobj\n");
	};

	const content = enc.encode(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
	push("%PDF-1.4\n");
	object(1, "<< /Type /Catalog /Pages 2 0 R >>");
	object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
	object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
	object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, bytes);
	object(5, `<< /Length ${content.length} >>`, content);

	const xref = length;
	let table = `xref\n0 6\n0000000000 65535 f \n`;
	for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
	push(table);
	push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
