import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { refreshTokens, users } from "@/db/schema";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "@/lib/auth/constants";
import { rememberPreviousAccount } from "@/lib/auth/accounts";
import { setSessionCookies } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/env";
import { signAccessToken } from "@/lib/auth/jwt";
import { verifyPassword } from "@/lib/auth/password";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";
import { getActivePrivilegeCodes } from "@/lib/rbac/eligibility";

const bodySchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	clientType: z.enum(["web", "mobile"]).optional().default("web"),
});

// Único endpoint para ambos clientes: fija cookies httpOnly (web) y devuelve
// el mismo par de tokens en el cuerpo JSON (para la futura app Android).
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}
	const { username, password, clientType } = parsed.data;

	const db = getDb();
	const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

	if (!user || !user.passwordHash || user.accountStatus !== "active" || !user.active || user.disfellowshipped) {
		return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
	}

	const validPassword = await verifyPassword(password, user.passwordHash);
	if (!validPassword) {
		return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
	}

	const privilegeCodes = await getActivePrivilegeCodes(db, user.id);
	const accessToken = await signAccessToken(
		{ sub: user.id, role: user.systemRole, privs: privilegeCodes, fullName: user.fullName },
		getEnv().JWT_SECRET,
		ACCESS_TOKEN_TTL_SECONDS,
	);

	const refreshTokenPlain = generateOpaqueToken();
	const refreshTokenHash = await hashOpaqueToken(refreshTokenPlain);
	await db.insert(refreshTokens).values({
		userId: user.id,
		tokenHash: refreshTokenHash,
		clientType,
		expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS[clientType] * 1000),
	});

	const response = NextResponse.json({
		accessToken,
		refreshToken: refreshTokenPlain,
		expiresIn: ACCESS_TOKEN_TTL_SECONDS,
		user: { id: user.id, fullName: user.fullName, role: user.systemRole },
	});
	setSessionCookies(response, accessToken, refreshTokenPlain, clientType);
	// Web multicuentas: la cuenta que estaba activa en este navegador queda guardada en lugar de perderse.
	if (clientType === "web") await rememberPreviousAccount(db, response, user.id);
	return response;
}
