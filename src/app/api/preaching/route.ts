import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { preachingErrorResponse, sessionSchema, toInput } from "@/lib/preaching/http";
import { createSession, listSessions } from "@/lib/preaching/service";
import { assertCanAccessPreachingModule } from "@/lib/rbac/guards";

export async function GET() {
	try {
		assertCanAccessPreachingModule(await getSession());
		return NextResponse.json({ items: await listSessions(getDb()) });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessPreachingModule(session);
		const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		const id = await createSession(getDb(), toInput(parsed.data), session.userId);
		return NextResponse.json({ id }, { status: 201 });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}
