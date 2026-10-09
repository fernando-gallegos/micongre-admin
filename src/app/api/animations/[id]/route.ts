import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { welcomeAnimations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCongregationModule } from "@/lib/rbac/guards";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		assertCanAccessCongregationModule(await getSession());
		const { id } = await params;
		await getDb().delete(welcomeAnimations).where(eq(welcomeAnimations.id, id));
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
