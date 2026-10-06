import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { serviceReports } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getPioneerAppointmentType } from "@/lib/rbac/eligibility";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const now = new Date();
		const year = Number(searchParams.get("year") ?? now.getFullYear());
		const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

		const db = getDb();
		const [report] = await db
			.select()
			.from(serviceReports)
			.where(
				and(
					eq(serviceReports.userId, session.userId),
					eq(serviceReports.periodYear, year),
					eq(serviceReports.periodMonth, month),
				),
			)
			.limit(1);

		const pioneerType = await getPioneerAppointmentType(db, session.userId);

		return NextResponse.json({ report: report ?? null, pioneerType, year, month });
	} catch (error) {
		return errorResponse(error);
	}
}
