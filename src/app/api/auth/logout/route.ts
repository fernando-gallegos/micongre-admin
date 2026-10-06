import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { refreshTokens } from "@/db/schema";
import { REFRESH_COOKIE_NAME } from "@/lib/auth/constants";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { hashOpaqueToken } from "@/lib/auth/tokens";

const bodySchema = z.object({ refreshToken: z.string().optional() });

export async function POST(request: Request) {
	const bodyResult = bodySchema.safeParse(await request.json().catch(() => ({})));
	const cookieStore = await cookies();
	const refreshTokenPlain =
		(bodyResult.success ? bodyResult.data.refreshToken : undefined) ??
		cookieStore.get(REFRESH_COOKIE_NAME)?.value;

	if (refreshTokenPlain) {
		const db = getDb();
		const tokenHash = await hashOpaqueToken(refreshTokenPlain);
		await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookies(response);
	return response;
}
