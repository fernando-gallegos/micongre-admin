import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { markSeen } from "@/lib/announcements/service";

/** La persona cerró la novedad: queda vista y no se vuelve a mostrar (en ningún dispositivo). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;
		if (!(await markSeen(getDb(), session.userId, id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
