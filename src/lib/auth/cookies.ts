import type { NextResponse } from "next/server";
import {
	ACCESS_COOKIE_NAME,
	ACCESS_TOKEN_TTL_SECONDS,
	REFRESH_COOKIE_NAME,
	REFRESH_TOKEN_TTL_SECONDS,
} from "./constants";

export function setAccessTokenCookie(response: NextResponse, accessToken: string) {
	response.cookies.set(ACCESS_COOKIE_NAME, accessToken, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: ACCESS_TOKEN_TTL_SECONDS,
	});
}

export function setSessionCookies(
	response: NextResponse,
	accessToken: string,
	refreshToken: string,
	clientType: "web" | "mobile" = "web",
) {
	setAccessTokenCookie(response, accessToken);
	response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: REFRESH_TOKEN_TTL_SECONDS[clientType],
	});
}

export function clearSessionCookies(response: NextResponse) {
	response.cookies.set(ACCESS_COOKIE_NAME, "", { path: "/", maxAge: 0 });
	response.cookies.set(REFRESH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
