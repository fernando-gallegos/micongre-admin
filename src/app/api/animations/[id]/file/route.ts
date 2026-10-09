import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { welcomeAnimations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

// El JSON de una animación (lo reproduce Mi Panel y la vista previa de Congregación). Cualquier persona con sesión.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await params;
	const [row] = await getDb().select({ data: welcomeAnimations.data }).from(welcomeAnimations).where(eq(welcomeAnimations.id, id)).limit(1);
	if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
	return new NextResponse(row.data, { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600" } });
}
