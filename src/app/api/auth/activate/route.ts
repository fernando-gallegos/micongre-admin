import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { previewActivation, redeemActivation } from "@/lib/auth/activation";
import { setSessionCookies } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/env";

const STATUS_BY_ERROR = { invalid: 400, used: 410, expired: 410, username_taken: 409 } as const;

// Solo lectura: precarga el formulario de activación con el usuario y la
// contraseña sugeridos, sin canjear el token — ver previewActivation.
export async function GET(request: Request) {
	const token = new URL(request.url).searchParams.get("token");
	if (!token) return NextResponse.json({ error: "invalid" }, { status: 400 });

	const db = getDb();
	const result = await previewActivation(db, token);
	if ("error" in result) {
		return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
	}
	return NextResponse.json(result);
}

const bodySchema = z.object({
	token: z.string().min(1),
	username: z
		.string()
		.trim()
		.min(3)
		.max(50)
		.regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos."),
	password: z.string().min(6),
});

// Mismo endpoint para el navegador (Fase 1) y, mañana, para la app Android
// que abra el enlace de activación como Android App Link — ver
// docs/mobile-activation-protocol.md.
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	const db = getDb();
	const result = await redeemActivation(db, parsed.data.token, getEnv().JWT_SECRET, {
		username: parsed.data.username,
		password: parsed.data.password,
	});

	if ("error" in result) {
		return NextResponse.json({ error: result.error }, { status: STATUS_BY_ERROR[result.error] });
	}

	const response = NextResponse.json(result);
	setSessionCookies(response, result.accessToken, result.refreshToken, "web");
	return response;
}
