import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coRecommendations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/rbac/guards";
import { updateRecommendationSchema } from "@/lib/validation/coVisit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		requireAdmin(session);
		const { id } = await params;

		const parsed = updateRecommendationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { biblicalQualificationsCheck, ...rest } = parsed.data;
		const db = getDb();
		await db
			.update(coRecommendations)
			.set({
				...rest,
				...(biblicalQualificationsCheck !== undefined
					? { biblicalQualificationsCheck: biblicalQualificationsCheck ? JSON.stringify(biblicalQualificationsCheck) : null }
					: {}),
			})
			.where(eq(coRecommendations.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
