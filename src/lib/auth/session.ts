import { cookies, headers } from "next/headers";
import { getEnv } from "@/lib/env";
import { ACCESS_COOKIE_NAME } from "./constants";
import { verifyAccessToken } from "./jwt";

export interface Session {
	userId: string;
	role: "admin" | "regular";
	privilegeCodes: string[];
	fullName: string;
}

/** Resuelve la sesión desde la cookie httpOnly (web) o la cabecera
 * `Authorization: Bearer` (futura app móvil) — el mismo orden que
 * `middleware.ts`, para Server Components y Server Actions. */
export async function getSession(): Promise<Session | null> {
	const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

	const cookieToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;
	const authHeader = headerStore.get("authorization");
	const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
	const token = cookieToken ?? bearerToken;
	if (!token) return null;

	const payload = await verifyAccessToken(token, getEnv().JWT_SECRET);
	if (!payload) return null;

	return {
		userId: payload.sub,
		role: payload.role,
		privilegeCodes: payload.privs,
		fullName: payload.fullName,
	};
}
