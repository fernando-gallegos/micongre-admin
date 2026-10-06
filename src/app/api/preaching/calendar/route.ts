import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { preachingErrorResponse } from "@/lib/preaching/http";
import { listSessionsForCalendar } from "@/lib/preaching/service";
import { canAccessPreachingModule } from "@/lib/rbac/guards";

// Calendario de predicación de un mes (?month=AAAA-MM): lo puede ver cualquier persona con sesión. Quien administra el módulo
// ve todas las salidas; los demás, solo las que les tocan (toda la congregación, su grupo o ellos).
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
		if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "invalid_month" }, { status: 400 });
		const canManage = canAccessPreachingModule(session);
		const items = await listSessionsForCalendar(getDb(), session.userId, { month, all: canManage });
		return NextResponse.json({ items, canManage });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}
