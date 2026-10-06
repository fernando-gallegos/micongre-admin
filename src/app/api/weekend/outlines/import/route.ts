import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { publicTalkOutlines } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { parseS99aEpub } from "@/lib/publicTalks/parseS99a";

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const formData = await request.formData().catch(() => null);
		const file = formData?.get("file");
		if (!(file instanceof File)) {
			return NextResponse.json({ error: "missing_file" }, { status: 400 });
		}

		const outlines = parseS99aEpub(await file.arrayBuffer());
		if (outlines.length === 0) {
			return NextResponse.json({ error: "unrecognized_file" }, { status: 422 });
		}

		const db = getDb();
		const existing = await db.select().from(publicTalkOutlines);
		const existingByNumber = new Map(existing.map((row) => [row.number, row]));

		let created = 0;
		let updated = 0;
		for (const outline of outlines) {
			const current = existingByNumber.get(outline.number);
			if (!current) {
				await db.insert(publicTalkOutlines).values(outline);
				created++;
			} else if (current.category !== outline.category || current.title !== outline.title) {
				await db
					.update(publicTalkOutlines)
					.set({ category: outline.category, title: outline.title })
					.where(eq(publicTalkOutlines.id, current.id));
				updated++;
			}
		}

		return NextResponse.json({ created, updated, total: outlines.length });
	} catch (error) {
		return errorResponse(error);
	}
}
