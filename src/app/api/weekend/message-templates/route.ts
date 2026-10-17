import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { weekendMessageTemplates } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { DEFAULT_TEMPLATES } from "@/lib/weekend/messageTemplate";

const bodySchema = z.object({ kind: z.enum(["incoming", "outgoing"]), body: z.string().max(4000) });

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const rows = await getDb().select().from(weekendMessageTemplates);
		const saved = Object.fromEntries(rows.map((r) => [r.kind, r.body]));
		return NextResponse.json({
			templates: { incoming: saved.incoming ?? DEFAULT_TEMPLATES.incoming, outgoing: saved.outgoing ?? DEFAULT_TEMPLATES.outgoing },
			defaults: DEFAULT_TEMPLATES,
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PUT(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		const db = getDb();
		const [existing] = await db.select().from(weekendMessageTemplates).where(eq(weekendMessageTemplates.kind, parsed.data.kind)).limit(1);
		if (existing) {
			await db.update(weekendMessageTemplates).set({ body: parsed.data.body, updatedAt: new Date() }).where(eq(weekendMessageTemplates.kind, parsed.data.kind));
		} else {
			await db.insert(weekendMessageTemplates).values(parsed.data);
		}
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
