import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { pendingFor } from "@/lib/announcements/service";

/** Novedades pendientes de quien consulta (web y app): las publicadas que le tocan por nivel y que todavía no cerró. Los tres niveles salen igual en
 * la web y en la app Android. */
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const items = await pendingFor(getDb(), session);
		return NextResponse.json({ items: items.map(({ id, title, image, intro, body, items }) => ({ id, title, image: image ?? null, intro: intro ?? null, body: body ?? null, items: items ?? [] })) });
	} catch (error) {
		return errorResponse(error);
	}
}
