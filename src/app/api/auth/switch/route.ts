import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { accountFromRefresh, readAccounts, withAccount, writeAccountsCookie } from "@/lib/auth/accounts";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/constants";
import { setSessionCookies } from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/refresh";
import { getEnv } from "@/lib/env";

const bodySchema = z.object({ accountId: z.string().min(1) });

// Cambia la cuenta activa del navegador por otra de las guardadas, sin pedir contraseña: se rota el refresh token de la que entra
// (con su detección de reuso) y la que salía queda guardada con el suyo. Si el de la guardada ya no sirve (venció o la cuenta se
// deshabilitó), se quita de la lista y se avisa para que vuelva a iniciar sesión.
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	const db = getDb();
	const saved = await readAccounts();
	const target = saved.find((a) => a.id === parsed.data.accountId);
	if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
	const rest = saved.filter((a) => a.id !== target.id);

	const result = await rotateRefreshToken(db, target.refresh, getEnv().JWT_SECRET);
	if (!result.ok || !result.refreshToken) {
		const response = NextResponse.json({ error: "session_expired" }, { status: 401 });
		writeAccountsCookie(response, rest);
		return response;
	}

	let list = rest;
	const previous = await accountFromRefresh(db, (await cookies()).get(REFRESH_COOKIE_NAME)?.value);
	if (previous && previous.id !== target.id) list = withAccount(list, previous);

	const response = NextResponse.json({ ok: true, user: result.user });
	setSessionCookies(response, result.accessToken, result.refreshToken, result.clientType);
	writeAccountsCookie(response, list);
	return response;
}
