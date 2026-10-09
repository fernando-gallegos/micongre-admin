import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Database } from "@/db/client";
import { refreshTokens, users } from "@/db/schema";
import { ACCOUNTS_COOKIE_NAME, MAX_SAVED_ACCOUNTS, REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_SECONDS } from "./constants";
import { fromBase64Url, toBase64Url } from "./encoding";
import { hashOpaqueToken } from "./tokens";

// Web multicuentas. La cuenta activa sigue siendo mc_access + mc_refresh (por eso getSession() y el middleware no cambian); las
// demás cuentas del navegador se guardan aquí con su refresh token. El refresh de una cuenta solo se rota cuando es la activa:
// al cambiar de cuenta se rota el de la que entra, y el de la que sale se guarda tal cual lo tenía la cookie activa.

export interface SavedAccount {
	id: string;
	name: string;
	refresh: string;
}

export function parseAccounts(raw: string | undefined): SavedAccount[] {
	if (!raw) return [];
	try {
		const data = JSON.parse(new TextDecoder().decode(fromBase64Url(raw))) as unknown;
		if (!Array.isArray(data)) return [];
		return data
			.filter((a): a is SavedAccount => !!a && typeof a.id === "string" && typeof a.name === "string" && typeof a.refresh === "string")
			.slice(0, MAX_SAVED_ACCOUNTS);
	} catch {
		return [];
	}
}

export async function readAccounts(): Promise<SavedAccount[]> {
	return parseAccounts((await cookies()).get(ACCOUNTS_COOKIE_NAME)?.value);
}

/** Guarda la lista (o borra la cookie si quedó vacía). */
export function writeAccountsCookie(response: NextResponse, list: SavedAccount[]) {
	if (list.length === 0) {
		response.cookies.set(ACCOUNTS_COOKIE_NAME, "", { path: "/", maxAge: 0 });
		return;
	}
	response.cookies.set(ACCOUNTS_COOKIE_NAME, toBase64Url(new TextEncoder().encode(JSON.stringify(list))), {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: REFRESH_TOKEN_TTL_SECONDS.web,
	});
}

/** Agrega (o mueve al frente) una cuenta; si se pasa del máximo, sale la más antigua. */
export function withAccount(list: SavedAccount[], entry: SavedAccount): SavedAccount[] {
	return [entry, ...list.filter((a) => a.id !== entry.id)].slice(0, MAX_SAVED_ACCOUNTS);
}

/** La cuenta a la que pertenece un refresh token vigente (para guardarla antes de cambiar o de iniciar sesión con otra). */
export async function accountFromRefresh(db: Database, refreshPlain: string | undefined): Promise<SavedAccount | null> {
	if (!refreshPlain) return null;
	const tokenHash = await hashOpaqueToken(refreshPlain);
	const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
	if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
	const [user] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, row.userId)).limit(1);
	return user ? { id: row.userId, name: user.fullName, refresh: refreshPlain } : null;
}

/** Al iniciar sesión (o activar un acceso) en un navegador que ya tenía otra cuenta activa, esa cuenta se guarda en lugar de perderse;
 * y si la que entra estaba guardada, deja de estarlo (ahora es la activa). Solo aplica al flujo web (la app móvil no manda cookies). */
export async function rememberPreviousAccount(db: Database, response: NextResponse, newUserId: string): Promise<void> {
	const store = await cookies();
	const hadList = !!store.get(ACCOUNTS_COOKIE_NAME)?.value;
	let list = parseAccounts(store.get(ACCOUNTS_COOKIE_NAME)?.value).filter((a) => a.id !== newUserId);
	const previous = await accountFromRefresh(db, store.get(REFRESH_COOKIE_NAME)?.value);
	if (previous && previous.id !== newUserId) list = withAccount(list, previous);
	if (hadList || list.length > 0) writeAccountsCookie(response, list);
}
