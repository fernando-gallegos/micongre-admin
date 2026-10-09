import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { refreshTokens } from "@/db/schema";
import { readAccounts, writeAccountsCookie } from "@/lib/auth/accounts";
import { hashOpaqueToken } from "@/lib/auth/tokens";

const bodySchema = z.object({ accountId: z.string().min(1) });

// "Quitar de este dispositivo": cierra la sesión guardada de esa cuenta (revoca su refresh token) y la saca de la lista.
export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	const saved = await readAccounts();
	const target = saved.find((a) => a.id === parsed.data.accountId);
	if (target) {
		const tokenHash = await hashOpaqueToken(target.refresh);
		await getDb().update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
	}
	const response = NextResponse.json({ ok: true });
	writeAccountsCookie(response, saved.filter((a) => a.id !== parsed.data.accountId));
	return response;
}
