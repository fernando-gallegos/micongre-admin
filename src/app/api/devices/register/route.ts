import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { deviceTokens } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { isFcmEnabled } from "@/lib/push/dispatch";

// publicKey: llave pública P-256 del dispositivo (65 bytes sin comprimir, base64url) para cifrar los push de punta a punta.
const bodySchema = z.object({ fcmToken: z.string().min(20).max(4096), publicKey: z.string().regex(/^[A-Za-z0-9_-]{86,88}$/).optional() });

// La app Android registra aquí el token de Firebase de su dispositivo (solo tiene sentido si el sitio usa FCM).
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		// El mismo teléfono puede estar registrado para varias personas (familias con un solo celular): una fila por persona + token.
		const [existing] = await db
			.select({ id: deviceTokens.id })
			.from(deviceTokens)
			.where(and(eq(deviceTokens.token, parsed.data.fcmToken), eq(deviceTokens.userId, session.userId)))
			.limit(1);
		if (existing) {
			await db
				.update(deviceTokens)
				.set({ userId: session.userId, lastSeenAt: new Date(), ...(parsed.data.publicKey ? { publicKey: parsed.data.publicKey } : {}) })
				.where(eq(deviceTokens.id, existing.id));
		} else {
			await db.insert(deviceTokens).values({ userId: session.userId, token: parsed.data.fcmToken, publicKey: parsed.data.publicKey ?? null });
		}
		return NextResponse.json({ ok: true, fcm: isFcmEnabled() });
	} catch (error) {
		return errorResponse(error);
	}
}
