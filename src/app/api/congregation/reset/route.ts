import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { wipeAllData } from "@/lib/backup/backup";
import { RESET_CONFIRMATION } from "@/lib/backup/constants";
import { getEnv } from "@/lib/env";
import { requireAdmin } from "@/lib/rbac/guards";

const bodySchema = z.object({ confirm: z.literal(RESET_CONFIRMATION) });

// Borra TODOS los datos de la congregación (solo administradores) y deja la
// app como nueva: sin administradores, así que el middleware manda a /setup.
// El cliente descarga el respaldo (GET /api/congregation/backup) antes de
// llamar aquí — este endpoint no lo hace por sí mismo.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		requireAdmin(session);

		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "confirmation_required" }, { status: 400 });

		await wipeAllData(getEnv().DB);

		const response = NextResponse.json({ ok: true });
		clearSessionCookies(response);
		return response;
	} catch (error) {
		return errorResponse(error);
	}
}
