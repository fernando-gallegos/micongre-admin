import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { deviceTokens } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

// La app Android quita su token al cerrar sesión: ese dispositivo deja de recibir los avisos de esa persona.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const parsed = z.object({ fcmToken: z.string().min(1) }).safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		await getDb().delete(deviceTokens).where(and(eq(deviceTokens.token, parsed.data.fcmToken), eq(deviceTokens.userId, session.userId)));
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
