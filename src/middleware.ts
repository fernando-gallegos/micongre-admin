import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/constants";
import { clearSessionCookies, setAccessTokenCookie, setSessionCookies } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { rotateRefreshToken } from "@/lib/auth/refresh";
import { getEnv } from "@/lib/env";
import { publicOrigin } from "@/lib/http/origin";
import { getSetupStatus } from "@/lib/setup/status";

export const config = {
	// Archivos de public/ que se piden sin sesión (logo del login/activación/setup y el service worker): fuera del middleware.
	// En producción Cloudflare los sirve antes del Worker; en `next dev` el middleware los mandaba al login.
	matcher: ["/((?!_next|favicon.ico|logo.svg|sw.js).*)"],
};

// Rutas que no exigen sesión. El asistente de configuración (/setup, /api/setup)
// se protege solo: se cierra en cuanto existe un administrador.
const PUBLIC_PREFIXES = ["/login", "/activar", "/api/auth", "/setup", "/api/setup", "/api/federation", "/api/cron", "/.well-known"];

// Que ya exista un admin se recuerda un rato por isolate para no consultar la
// base en cada petición. Es corto a propósito: "Borrar todos los datos" (en
// Congregación) deja la app sin admin y debe volver a /setup pronto. Mientras
// falte el admin, se consulta cada vez.
const SETUP_COMPLETE_TTL_MS = 30_000;
let setupCompleteAt = 0;

async function isSetupComplete(): Promise<boolean> {
	if (Date.now() - setupCompleteAt < SETUP_COMPLETE_TTL_MS) return true;
	try {
		const { needsSetup } = await getSetupStatus(getDb());
		if (!needsSetup) setupCompleteAt = Date.now();
		return !needsSetup;
	} catch {
		// Base sin migrar u otro fallo: no encerrar a nadie en /setup.
		return true;
	}
}

export async function middleware(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	const isApiRoute = pathname.startsWith("/api/");
	const inPath = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
	const isSetupRoute = inPath("/setup") || inPath("/api/setup");

	// App nueva (sin ningún administrador): todo lleva al asistente. Los
	// archivos estáticos (con extensión) quedan fuera para no romper su carga.
	if (!isSetupRoute && !/\.[a-z0-9]+$/i.test(pathname) && !(await isSetupComplete())) {
		if (isApiRoute) return NextResponse.json({ error: "setup_required" }, { status: 409 });
		return NextResponse.redirect(new URL("/setup", publicOrigin(request)));
	}

	if (PUBLIC_PREFIXES.some(inPath)) return NextResponse.next();

	const cookieToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
	const authHeader = request.headers.get("authorization");
	const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
	const token = cookieToken ?? bearerToken;

	const unauthorized = () => {
		if (isApiRoute) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const loginUrl = new URL("/login", publicOrigin(request));
		loginUrl.searchParams.set("next", request.nextUrl.pathname);
		const response = NextResponse.redirect(loginUrl);
		clearSessionCookies(response);
		return response;
	};

	let payload = token ? await verifyAccessToken(token, getEnv().JWT_SECRET) : null;
	let rotated: { accessToken: string; refreshToken: string | null; clientType: "web" | "mobile" } | null = null;

	// El access token dura 15 min; si venció mientras la pestaña estaba en
	// segundo plano o el equipo suspendido, renovamos aquí mismo con el
	// refresh token (cookie, solo flujo web) en vez de cerrar la sesión — el
	// cliente también renueva proactivamente (ver SessionKeepAlive), esto es
	// la red de seguridad para cuando no llegó a hacerlo a tiempo. La sesión
	// solo debe terminar por un logout explícito, nunca por inactividad.
	if (!payload && !bearerToken) {
		const refreshTokenPlain = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
		if (refreshTokenPlain) {
			const result = await rotateRefreshToken(getDb(), refreshTokenPlain, getEnv().JWT_SECRET);
			if (result.ok) {
				payload = await verifyAccessToken(result.accessToken, getEnv().JWT_SECRET);
				rotated = { accessToken: result.accessToken, refreshToken: result.refreshToken, clientType: result.clientType };
			}
		}
	}

	if (!payload) return unauthorized();

	// Gate básico por rol de sistema para /admin — el gateo fino por
	// privilegio (elegibilidad, autoría de informes) vive en lib/rbac/guards.ts,
	// más cerca de cada acción concreta.
	if (pathname.startsWith("/admin") && payload.role !== "admin") {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-user-id", payload.sub);
	requestHeaders.set("x-user-role", payload.role);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	if (rotated) {
		if (rotated.refreshToken) {
			setSessionCookies(response, rotated.accessToken, rotated.refreshToken, rotated.clientType);
		} else {
			setAccessTokenCookie(response, rotated.accessToken);
		}
	}
	return response;
}
