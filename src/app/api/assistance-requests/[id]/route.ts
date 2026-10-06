import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { assistanceRequests } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessPastoralDashboard } from "@/lib/rbac/guards";
import { updateAssistanceRequestSchema } from "@/lib/validation/pastoralCare";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);
		const { id } = await params;

		const parsed = updateAssistanceRequestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { assignedElders, ...rest } = parsed.data;
		const db = getDb();
		await db
			.update(assistanceRequests)
			.set({
				...rest,
				...(assignedElders !== undefined ? { assignedElders: assignedElders ? JSON.stringify(assignedElders) : null } : {}),
			})
			.where(eq(assistanceRequests.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
