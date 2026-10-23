import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requestPasswordHelp } from "@/lib/auth/passwordHelp";

const bodySchema = z.object({ identifier: z.string().trim().min(2).max(120) });

/** «¿Olvidaste tu contraseña?» (pública): avisa a quien puede generar un enlace nuevo. La respuesta es siempre la misma, exista o no la
 * cuenta, para no revelar quién usa la app (ver lib/auth/passwordHelp.ts). */
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	// Detrás de micongre-router la IP real llega en x-client-ip (Cloudflare pone la del router en cf-connecting-ip).
	const ip = request.headers.get("x-client-ip") || request.headers.get("cf-connecting-ip") || "desconocida";
	try {
		await requestPasswordHelp(getDb(), parsed.data.identifier, ip);
	} catch (error) {
		// Un fallo al avisar no se le muestra distinto a quien pidió ayuda (sería otra forma de saber si la cuenta existe).
		console.error("password_help_failed", error);
	}
	return NextResponse.json({ ok: true });
}
