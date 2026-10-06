import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getPriorityMatrix } from "@/lib/queries/pastoralDashboard";
import { assertCanAccessPastoralDashboard } from "@/lib/rbac/guards";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const db = getDb();
		const items = await getPriorityMatrix(db);

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}
