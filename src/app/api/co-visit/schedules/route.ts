import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coVisitSchedules } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCoVisitScheduleModule } from "@/lib/rbac/guards";
import { createVisitSchema } from "@/lib/validation/coVisit";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);

		const db = getDb();
		const rows = await db.select().from(coVisitSchedules).orderBy(desc(coVisitSchedules.startDate));

		return NextResponse.json({
			items: rows.map((r) => ({
				...r,
				hospitalitySchedule: r.hospitalitySchedule ? JSON.parse(r.hospitalitySchedule) : null,
			})),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);

		const parsed = createVisitSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { hospitalitySchedule, ...rest } = parsed.data;
		const db = getDb();
		const [created] = await db
			.insert(coVisitSchedules)
			.values({
				...rest,
				hospitalitySchedule: hospitalitySchedule ? JSON.stringify(hospitalitySchedule) : null,
				createdByUserId: session.userId,
			})
			.returning({ id: coVisitSchedules.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
