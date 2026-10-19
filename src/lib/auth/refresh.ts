import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { refreshTokens, users } from "@/db/schema";
import { getActivePrivilegeCodes } from "@/lib/rbac/eligibility";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./constants";
import { signAccessToken } from "./jwt";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens";

export type RefreshResult =
	| {
			ok: true;
			accessToken: string;
			// null cuando esta llamada perdió una carrera de rotación concurrente
			// contra otra request con el mismo refresh token (ver más abajo) — en
			// ese caso no hay refresh token nuevo que devolver, ni cookie que tocar.
			refreshToken: string | null;
			clientType: "web" | "mobile";
			user: { id: string; fullName: string; role: "admin" | "regular" };
	  }
	| { ok: false; error: "invalid" | "reused" | "expired" | "account_disabled" };

// Ventana en la que un refresh token ya rotado se tolera como carrera
// concurrente (dos requests del mismo cliente llegan casi a la vez con el
// mismo token, p.ej. dos pestañas reabiertas juntas) en vez de dispararse
// como reuso malicioso y tumbar toda la sesión. 2 minutos cubren la red móvil
// lenta y los trabajos de fondo de la app; fuera de ella, reusar un token rotado
// sigue cerrando todas las sesiones.
const ROTATION_RACE_GRACE_MS = 2 * 60 * 1000;

/** Rota un refresh token (rotación + detección de reuso) y emite un nuevo
 * access token. Compartida por `POST /api/auth/refresh` y por `middleware.ts`,
 * que la usa como red de seguridad para renovar la sesión sin depender del
 * cliente cuando el access token de 15 min ya venció (pestaña en segundo
 * plano, laptop suspendida, etc.) — la sesión solo debe terminar por un
 * logout explícito, nunca por sola inactividad. */
export async function rotateRefreshToken(
	db: Database,
	refreshTokenPlain: string,
	jwtSecret: string,
): Promise<RefreshResult> {
	const tokenHash = await hashOpaqueToken(refreshTokenPlain);
	const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);

	if (!row) return { ok: false, error: "invalid" };

	if (row.revokedAt) {
		const revokedRecently = Date.now() - row.revokedAt.getTime() < ROTATION_RACE_GRACE_MS;
		if (revokedRecently && row.replacedByTokenId) {
			const raceResult = await tryRaceTolerantAccessToken(db, row.replacedByTokenId, jwtSecret);
			if (raceResult) return raceResult;
		}
		// Reuso de un token ya rotado/revocado (fuera de la ventana de carrera
		// concurrente de arriba): posible robo — se corta toda la sesión.
		await db
			.update(refreshTokens)
			.set({ revokedAt: new Date() })
			.where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
		return { ok: false, error: "reused" };
	}

	if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };

	const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
	if (!user || !user.active || user.accountStatus !== "active") return { ok: false, error: "account_disabled" };

	const newRefreshTokenPlain = generateOpaqueToken();
	const newRefreshTokenHash = await hashOpaqueToken(newRefreshTokenPlain);
	// capExpiresAt (acceso de visita del SC, ver lib/auth/activation.ts) viaja
	// sin cambios de rotación en rotación: la ventana deslizante normal nunca
	// puede empujar la sesión más allá de esa fecha.
	const slidingExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS[row.clientType] * 1000);
	const newExpiresAt =
		row.capExpiresAt && row.capExpiresAt.getTime() < slidingExpiresAt.getTime() ? row.capExpiresAt : slidingExpiresAt;

	const [newRow] = await db
		.insert(refreshTokens)
		.values({
			userId: user.id,
			tokenHash: newRefreshTokenHash,
			clientType: row.clientType,
			expiresAt: newExpiresAt,
			capExpiresAt: row.capExpiresAt,
		})
		.returning();

	await db
		.update(refreshTokens)
		.set({ revokedAt: new Date(), replacedByTokenId: newRow.id })
		.where(eq(refreshTokens.id, row.id));

	const privilegeCodes = await getActivePrivilegeCodes(db, user.id);
	const accessToken = await signAccessToken(
		{ sub: user.id, role: user.systemRole, privs: privilegeCodes, fullName: user.fullName },
		jwtSecret,
		ACCESS_TOKEN_TTL_SECONDS,
	);

	return {
		ok: true,
		accessToken,
		refreshToken: newRefreshTokenPlain,
		clientType: row.clientType,
		user: { id: user.id, fullName: user.fullName, role: user.systemRole },
	};
}

/** Camino de la request que perdió una carrera de rotación: el token que
 * traía ya fue reemplazado hace un instante por otra request concurrente.
 * En vez de tratarlo como reuso malicioso, si el sucesor sigue vigente le
 * emitimos un access token nuevo a esta request sin rotar de nuevo (no
 * tenemos el texto plano del token sucesor para devolverlo, y no hace
 * falta: la cookie de refresh del navegador ya quedó en ese valor gracias a
 * la respuesta de la request que ganó la carrera). */
async function tryRaceTolerantAccessToken(
	db: Database,
	successorTokenId: string,
	jwtSecret: string,
): Promise<RefreshResult | null> {
	const [successor] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, successorTokenId)).limit(1);
	if (!successor || successor.revokedAt || successor.expiresAt.getTime() < Date.now()) return null;

	const [user] = await db.select().from(users).where(eq(users.id, successor.userId)).limit(1);
	if (!user || !user.active || user.accountStatus !== "active") return null;

	const privilegeCodes = await getActivePrivilegeCodes(db, user.id);
	const accessToken = await signAccessToken(
		{ sub: user.id, role: user.systemRole, privs: privilegeCodes, fullName: user.fullName },
		jwtSecret,
		ACCESS_TOKEN_TTL_SECONDS,
	);

	return {
		ok: true,
		accessToken,
		refreshToken: null,
		clientType: successor.clientType,
		user: { id: user.id, fullName: user.fullName, role: user.systemRole },
	};
}
