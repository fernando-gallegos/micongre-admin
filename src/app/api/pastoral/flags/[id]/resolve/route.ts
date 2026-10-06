import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { pastoralFlags } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { RbacError } from "@/lib/rbac/errors";
import { isServiceCommitteeMember } from "@/lib/rbac/guards";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const db = getDb();
		const [existing] = await db
			.select({ flaggedByUserId: pastoralFlags.flaggedByUserId })
			.from(pastoralFlags)
			.where(eq(pastoralFlags.id, id))
			.limit(1);
		if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

		if (session.role !== "admin" && existing.flaggedByUserId !== session.userId) {
			const isCommittee = await isServiceCommitteeMember(db, session.userId);
			if (!isCommittee) throw new RbacError("No puedes resolver una bandera que no creaste.");
		}

		await db.update(pastoralFlags).set({ resolvedAt: new Date() }).where(eq(pastoralFlags.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
