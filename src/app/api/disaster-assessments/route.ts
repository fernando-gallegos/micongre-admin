import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { disasterAssessmentRecords } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessDisasterModule } from "@/lib/rbac/guards";
import { createAssessmentSchema } from "@/lib/validation/disasterPreparedness";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessDisasterModule(session);

		const db = getDb();
		const rows = await db
			.select()
			.from(disasterAssessmentRecords)
			.orderBy(desc(disasterAssessmentRecords.reportDate));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessDisasterModule(session);

		const parsed = createAssessmentSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db
			.insert(disasterAssessmentRecords)
			.values({ ...parsed.data, createdByUserId: session.userId })
			.returning({ id: disasterAssessmentRecords.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
