import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningCongregations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse, invalidBody } from "@/lib/cleaning/http";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";
import { createHallCongregationSchema } from "@/lib/validation/cleaning";

// Otras congregaciones que comparten el Salón del Reino.
export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const items = await getDb().select().from(cleaningCongregations).orderBy(asc(cleaningCongregations.name));
		return NextResponse.json({ items });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const parsed = createHallCongregationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const [row] = await getDb()
			.insert(cleaningCongregations)
			.values({ name: parsed.data.name })
			.returning({ id: cleaningCongregations.id });
		if (!row) throw new Error("cleaning_congregation_insert_failed");
		return NextResponse.json({ id: row.id }, { status: 201 });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
