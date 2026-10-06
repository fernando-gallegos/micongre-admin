import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { hasOtherActiveAdmin, removeAccountAccess } from "@/lib/auth/deleteAccount";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";

const bodySchema = z.object({ password: z.string().min(1) });

// Eliminar mi cuenta (la pide la propia persona, desde la web o la app Android; Google Play lo exige). Solo quita el
// acceso: la ficha de publicador se queda en la congregación. Pide la contraseña para que nadie con el teléfono
// desbloqueado pueda borrarla por error o por travesura.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		const [user] = await db
			.select({ passwordHash: users.passwordHash, systemRole: users.systemRole })
			.from(users)
			.where(eq(users.id, session.userId))
			.limit(1);
		if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
			return NextResponse.json({ error: "invalid_password" }, { status: 403 });
		}
		if (user.systemRole === "admin" && !(await hasOtherActiveAdmin(db, session.userId))) {
			return NextResponse.json({ error: "last_admin" }, { status: 409 });
		}

		await removeAccountAccess(db, session.userId);

		const response = NextResponse.json({ ok: true });
		clearSessionCookies(response);
		return response;
	} catch (error) {
		return errorResponse(error);
	}
}
