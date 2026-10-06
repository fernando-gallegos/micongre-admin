import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations, talkArrangements } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { createArrangementSchema } from "@/lib/federation/validation";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const db = getDb();
		const rows = await db.select().from(talkArrangements).orderBy(asc(talkArrangements.year), asc(talkArrangements.month));
		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

// Anota un mes para una congregación. Sólo queda registrado ("planned"); la
// solicitud al fork se envía aparte con la acción `request`.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = createArrangementSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const { congregationId, year, month } = parsed.data;

		const db = getDb();
		const [congregation] = await db
			.select({ id: speakerCongregations.id })
			.from(speakerCongregations)
			.where(eq(speakerCongregations.id, congregationId));
		if (!congregation) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const [clash] = await db
			.select({ id: talkArrangements.id })
			.from(talkArrangements)
			.where(and(eq(talkArrangements.congregationId, congregationId), eq(talkArrangements.year, year), eq(talkArrangements.month, month)));
		if (clash) return NextResponse.json({ error: "month_taken" }, { status: 409 });

		const [arrangement] = await db.insert(talkArrangements).values({ congregationId, direction: "outgoing", year, month }).returning();
		return NextResponse.json({ arrangement }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
