import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { preachingErrorResponse, sessionSchema, toInput } from "@/lib/preaching/http";
import { deleteSession, publishNotices, updateSession } from "@/lib/preaching/service";
import { assertCanAccessPreachingModule } from "@/lib/rbac/guards";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessPreachingModule(session);
		const { id } = await params;
		const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		await updateSession(getDb(), id, toInput(parsed.data), session.userId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}

// Reenviar el aviso de una salida (reemplaza el anterior).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessPreachingModule(session);
		const { id } = await params;
		await publishNotices(getDb(), id, session.userId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		assertCanAccessPreachingModule(await getSession());
		const { id } = await params;
		await deleteSession(getDb(), id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return preachingErrorResponse(error);
	}
}
