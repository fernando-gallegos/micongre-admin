import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { assistanceRequests, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessPastoralDashboard } from "@/lib/rbac/guards";
import { createAssistanceRequestSchema } from "@/lib/validation/pastoralCare";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const db = getDb();
		const rows = await db
			.select({
				id: assistanceRequests.id,
				publisherId: assistanceRequests.publisherId,
				publisherName: users.fullName,
				type: assistanceRequests.type,
				requestDate: assistanceRequests.requestDate,
				status: assistanceRequests.status,
				assignedElders: assistanceRequests.assignedElders,
				resolutionSummary: assistanceRequests.resolutionSummary,
				createdAt: assistanceRequests.createdAt,
			})
			.from(assistanceRequests)
			.innerJoin(users, eq(users.id, assistanceRequests.publisherId))
			.orderBy(desc(assistanceRequests.createdAt));

		return NextResponse.json({
			items: rows.map((r) => ({ ...r, assignedElders: r.assignedElders ? JSON.parse(r.assignedElders) : [] })),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessPastoralDashboard(session);

		const parsed = createAssistanceRequestSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { assignedElders, ...rest } = parsed.data;
		const db = getDb();
		const [created] = await db
			.insert(assistanceRequests)
			.values({
				...rest,
				assignedElders: assignedElders ? JSON.stringify(assignedElders) : null,
				createdByUserId: session.userId,
			})
			.returning({ id: assistanceRequests.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
