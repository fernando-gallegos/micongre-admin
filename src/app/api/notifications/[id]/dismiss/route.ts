import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { notificationDismissals } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

// Oculta una notificación puntual para quien la pide — no requiere que sea
// destinatario válido de ese scope, con lo que se ignora de forma segura si
// se llama con un id que ya no le aplica.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { id } = await params;

		const db = getDb();
		await db
			.insert(notificationDismissals)
			.values({ notificationId: id, userId: session.userId })
			.onConflictDoNothing();

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
