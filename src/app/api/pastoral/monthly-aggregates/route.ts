import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getMonthlyServiceAggregates, getPioneerPaceAlerts } from "@/lib/queries/pastoralDashboard";
import { assertCanAccessPastoralDashboard } from "@/lib/rbac/guards";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const db = getDb();
		const [months, pioneerAlerts] = await Promise.all([getMonthlyServiceAggregates(db), getPioneerPaceAlerts(db)]);

		return NextResponse.json({ months, pioneerAlerts });
	} catch (error) {
		return errorResponse(error);
	}
}
