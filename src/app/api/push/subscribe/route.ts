import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

const subscribeSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		const [existing] = await db
			.select({ id: pushSubscriptions.id })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
			.limit(1);

		if (existing) {
			await db
				.update(pushSubscriptions)
				.set({
					userId: session.userId,
					p256dh: parsed.data.keys.p256dh,
					authKey: parsed.data.keys.auth,
					lastSeenAt: new Date(),
				})
				.where(eq(pushSubscriptions.id, existing.id));
		} else {
			await db.insert(pushSubscriptions).values({
				userId: session.userId,
				endpoint: parsed.data.endpoint,
				p256dh: parsed.data.keys.p256dh,
				authKey: parsed.data.keys.auth,
			});
		}

		return NextResponse.json({ ok: true }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = z.object({ endpoint: z.string().url() }).safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		await db
			.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, session.userId)));

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
