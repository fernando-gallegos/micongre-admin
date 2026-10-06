import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accountActivationTokens, refreshTokens, users } from "@/db/schema";
import { getActivePrivilegeCodes } from "@/lib/rbac/eligibility";
import {
	ACCESS_TOKEN_TTL_SECONDS,
	ACTIVATION_TOKEN_TTL_SECONDS,
	REFRESH_TOKEN_TTL_SECONDS,
} from "./constants";
import { signAccessToken } from "./jwt";
import { generateReadablePassword, hashPassword } from "./password";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens";
import { generateUsername } from "./username";

export type ActivationPurpose = "initial_setup" | "password_reset" | "circuit_overseer_visit";

/** Genera un enlace de un solo uso; el token en claro solo existe en la URL
 * devuelta — nunca se persiste (solo su hash). `expiresAtOverride` se usa
 * para el acceso temporal del SC: el enlace (y, vía redeemActivation, toda la
 * sesión) vence el día que termina la visita en vez del TTL estándar de 14
 * días — ver co_visit_schedules.endDate. */
export async function issueActivationLink(
	db: Database,
	params: {
		userId: string;
		purpose: ActivationPurpose;
		createdByUserId: string;
		baseUrl: string;
		expiresAtOverride?: Date;
	},
): Promise<string> {
	const token = generateOpaqueToken();
	const tokenHash = await hashOpaqueToken(token);
	const expiresAt = params.expiresAtOverride ?? new Date(Date.now() + ACTIVATION_TOKEN_TTL_SECONDS * 1000);

	await db.insert(accountActivationTokens).values({
		userId: params.userId,
		tokenHash,
		purpose: params.purpose,
		createdByUserId: params.createdByUserId,
		expiresAt,
	});

	await db
		.update(users)
		.set({ accountStatus: "invited", updatedAt: new Date() })
		.where(eq(users.id, params.userId));

	return `${params.baseUrl}/activar/${token}`;
}

export type ActivationFailure = { error: "invalid" | "expired" | "used" };

type AccountActivationTokenRow = typeof accountActivationTokens.$inferSelect;

async function loadValidActivationRow(
	db: Database,
	token: string,
): Promise<{ ok: true; row: AccountActivationTokenRow } | { ok: false; error: ActivationFailure["error"] }> {
	const tokenHash = await hashOpaqueToken(token);
	const [row] = await db
		.select()
		.from(accountActivationTokens)
		.where(eq(accountActivationTokens.tokenHash, tokenHash))
		.limit(1);

	if (!row) return { ok: false, error: "invalid" };
	if (row.usedAt) return { ok: false, error: "used" };
	if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };
	return { ok: true, row };
}

export interface ActivationPreview {
	fullName: string;
	suggestedUsername: string;
	suggestedPassword: string;
	// false cuando la cuenta ya tiene usuario (restablecimiento de una cuenta
	// existente, o acceso del SC) — ahí el usuario no se puede tocar, solo la
	// contraseña, para no romper el login que la persona ya conoce.
	usernameEditable: boolean;
}

/** Solo lectura: no marca el token como usado. La pantalla de activación la
 * llama al cargar para precargar el formulario con usuario/contraseña
 * sugeridos — el canje real (y el consumo del token) ocurre en
 * `redeemActivation`, cuando la persona confirma sus datos. */
export async function previewActivation(
	db: Database,
	token: string,
): Promise<ActivationPreview | ActivationFailure> {
	const result = await loadValidActivationRow(db, token);
	if (!result.ok) return { error: result.error };
	const { row } = result;

	const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
	if (!user) return { error: "invalid" };

	const usernameEditable = row.purpose === "initial_setup" && !user.username;
	const suggestedUsername = user.username ?? (await generateUsername(db, user.fullName));

	return {
		fullName: user.fullName,
		suggestedUsername,
		suggestedPassword: generateReadablePassword(),
		usernameEditable,
	};
}

export interface ActivationResult {
	username: string;
	password: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	user: { id: string; fullName: string; role: "admin" | "regular" };
}

export type RedeemFailure = ActivationFailure | { error: "username_taken" };

/**
 * Canjea el token del enlace con el usuario/contraseña que la persona eligió
 * (o dejó como venían sugeridos): activa la cuenta y devuelve una sesión ya
 * iniciada — el mismo contrato para el navegador (Fase 1) y, mañana, para la
 * app Android que abra el enlace como Android App Link (ver
 * docs/mobile-activation-protocol.md).
 */
export async function redeemActivation(
	db: Database,
	token: string,
	jwtSecret: string,
	chosen: { username: string; password: string },
): Promise<ActivationResult | RedeemFailure> {
	const result = await loadValidActivationRow(db, token);
	if (!result.ok) return { error: result.error };
	const { row } = result;

	const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
	if (!user) return { error: "invalid" };

	const usernameEditable = row.purpose === "initial_setup" && !user.username;
	const username = usernameEditable ? chosen.username : (user.username ?? chosen.username);

	if (usernameEditable && username !== user.username) {
		const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
		if (existing) return { error: "username_taken" };
	}

	const password = chosen.password;
	const passwordHash = await hashPassword(password);

	await db
		.update(users)
		.set({ username, passwordHash, accountStatus: "active", updatedAt: new Date() })
		.where(eq(users.id, user.id));
	await db
		.update(accountActivationTokens)
		.set({ usedAt: new Date() })
		.where(eq(accountActivationTokens.id, row.id));

	const privilegeCodes = await getActivePrivilegeCodes(db, user.id);
	const accessToken = await signAccessToken(
		{ sub: user.id, role: user.systemRole, privs: privilegeCodes, fullName: user.fullName },
		jwtSecret,
		ACCESS_TOKEN_TTL_SECONDS,
	);

	const refreshTokenPlain = generateOpaqueToken();
	const refreshTokenHash = await hashOpaqueToken(refreshTokenPlain);
	// Acceso de visita del SC: el refresh token no vive más que el propio
	// token de activación (que ya vence al terminar la visita) — y capExpiresAt
	// viaja con cada rotación futura (ver api/auth/refresh/route.ts) para que
	// la ventana deslizante normal no pueda extender la sesión más allá de esa
	// fecha. Ver POST /api/publishers/[id]/access.
	const isVisitAccess = row.purpose === "circuit_overseer_visit";
	await db.insert(refreshTokens).values({
		userId: user.id,
		tokenHash: refreshTokenHash,
		clientType: "web",
		expiresAt: isVisitAccess ? row.expiresAt : new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS.web * 1000),
		capExpiresAt: isVisitAccess ? row.expiresAt : null,
	});

	return {
		username,
		password,
		accessToken,
		refreshToken: refreshTokenPlain,
		expiresIn: ACCESS_TOKEN_TTL_SECONDS,
		user: { id: user.id, fullName: user.fullName, role: user.systemRole },
	};
}
