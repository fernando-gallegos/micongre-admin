import { and, asc, eq, like, lte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publicTalkOutlines, weekendMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { createTalkOutlineSchema } from "@/lib/validation/talkOutlines";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const { searchParams } = new URL(request.url);
		const search = searchParams.get("search")?.trim();
		const category = searchParams.get("category")?.trim();

		const conditions = [];
		if (search) conditions.push(like(publicTalkOutlines.title, `%${search}%`));
		if (category) conditions.push(eq(publicTalkOutlines.category, category));

		const db = getDb();
		const today = new Date().toISOString().slice(0, 10);
		const [rows, lastGivenRows] = await Promise.all([
			db
				.select()
				.from(publicTalkOutlines)
				.where(conditions.length ? and(...conditions) : undefined)
				.orderBy(asc(publicTalkOutlines.category), asc(publicTalkOutlines.number)),
			db
				.select({
					talkOutlineId: weekendMeetings.talkOutlineId,
					lastDate: sql<string>`max(${weekendMeetings.meetingDate})`,
				})
				.from(weekendMeetings)
				.where(and(ne(weekendMeetings.status, "cancelled"), lte(weekendMeetings.meetingDate, today)))
				.groupBy(weekendMeetings.talkOutlineId),
		]);

		const lastGivenByOutline = new Map(lastGivenRows.map((r) => [r.talkOutlineId, r.lastDate]));
		const items = rows.map((row) => ({ ...row, lastGivenDate: lastGivenByOutline.get(row.id) ?? null }));

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = createTalkOutlineSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [outline] = await db.insert(publicTalkOutlines).values(parsed.data).returning();

		return NextResponse.json({ outline }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
