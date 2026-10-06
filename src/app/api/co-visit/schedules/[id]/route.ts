import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coVisitSchedules } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCoVisitScheduleModule } from "@/lib/rbac/guards";
import { updateVisitSchema } from "@/lib/validation/coVisit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);
		const { id } = await params;

		const parsed = updateVisitSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { hospitalitySchedule, ...rest } = parsed.data;
		const db = getDb();
		await db
			.update(coVisitSchedules)
			.set({
				...rest,
				...(hospitalitySchedule !== undefined
					? { hospitalitySchedule: hospitalitySchedule ? JSON.stringify(hospitalitySchedule) : null }
					: {}),
			})
			.where(eq(coVisitSchedules.id, id));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
