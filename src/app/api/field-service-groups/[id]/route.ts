import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fieldServiceGroups } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessServiceGroupsModule } from "@/lib/rbac/guards";
import { updateFieldServiceGroupSchema } from "@/lib/validation/fieldServiceGroups";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessServiceGroupsModule(session);
		const { id } = await params;

		const parsed = updateFieldServiceGroupSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		await db.update(fieldServiceGroups).set(parsed.data).where(eq(fieldServiceGroups.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
