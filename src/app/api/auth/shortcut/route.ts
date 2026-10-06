import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { visibleGroups } from "@/components/layout/navItems";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

const schema = z.object({ href: z.string().max(100).nullable() });

// Acceso directo de la barra inferior: solo un módulo al que la persona tiene acceso (o ninguno).
export async function PUT(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	const { href } = parsed.data;
	if (href) {
		const allowed = visibleGroups(session.role, session.privilegeCodes)
			.flatMap((g) => g.items)
			.some((i) => i.href === href);
		if (!allowed) return NextResponse.json({ error: "not_allowed" }, { status: 403 });
	}

	await getDb().update(users).set({ navShortcut: href }).where(eq(users.id, session.userId));
	return NextResponse.json({ ok: true });
}
