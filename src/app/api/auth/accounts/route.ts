import { NextResponse } from "next/server";
import { readAccounts } from "@/lib/auth/accounts";
import { getSession } from "@/lib/auth/session";

// Cuentas de este navegador para el selector: la activa (si hay sesión) y las guardadas. Solo nombres: los tokens viajan en una
// cookie httpOnly que el JavaScript de la página no puede leer.
export async function GET() {
	const [session, saved] = await Promise.all([getSession(), readAccounts()]);
	return NextResponse.json(
		{
			active: session ? { id: session.userId, fullName: session.fullName } : null,
			accounts: saved.filter((a) => a.id !== session?.userId).map((a) => ({ id: a.id, fullName: a.name })),
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
