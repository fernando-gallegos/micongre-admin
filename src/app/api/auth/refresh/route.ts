import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_COOKIE_NAME } from "@/lib/auth/constants";
import { clearSessionCookies, setAccessTokenCookie, setSessionCookies } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/env";
import { rotateRefreshToken } from "@/lib/auth/refresh";

const bodySchema = z.object({ refreshToken: z.string().optional() });

// Mobile manda el refresh token en el body; web depende de la cookie.
// Rotación con detección de reuso: si alguien intenta reusar un token ya
// revocado, se revoca toda la cadena de sesiones de ese usuario.
export async function POST(request: Request) {
	const bodyResult = bodySchema.safeParse(await request.json().catch(() => ({})));
	const cookieStore = await cookies();
	const tokenPlain = bodyResult.success ? bodyResult.data.refreshToken : undefined;
	const refreshTokenPlain = tokenPlain ?? cookieStore.get(REFRESH_COOKIE_NAME)?.value;

	if (!refreshTokenPlain) {
		return NextResponse.json({ error: "missing_refresh_token" }, { status: 401 });
	}

	const db = getDb();
	const result = await rotateRefreshToken(db, refreshTokenPlain, getEnv().JWT_SECRET);

	if (!result.ok) {
		const status = 401;
		if (result.error === "reused") {
			const response = NextResponse.json({ error: "refresh_token_reused" }, { status });
			clearSessionCookies(response);
			return response;
		}
		const errorCode =
			result.error === "invalid"
				? "invalid_refresh_token"
				: result.error === "expired"
					? "expired_refresh_token"
					: "account_disabled";
		return NextResponse.json({ error: errorCode }, { status });
	}

	const response = NextResponse.json({
		accessToken: result.accessToken,
		refreshToken: result.refreshToken,
		expiresIn: ACCESS_TOKEN_TTL_SECONDS,
		user: result.user,
	});
	// refreshToken es null cuando esta request perdió una carrera de rotación
	// concurrente (ver rotateRefreshToken) — la cookie de refresh ya quedó
	// puesta por la request que ganó, así que aquí solo tocamos el access token.
	if (result.refreshToken) {
		setSessionCookies(response, result.accessToken, result.refreshToken, result.clientType);
	} else {
		setAccessTokenCookie(response, result.accessToken);
	}
	return response;
}
