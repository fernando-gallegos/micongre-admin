import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import { ANIMATION_COOLDOWN_SECONDS } from "@/lib/animations/folders";
import { pickAnimationFor } from "@/lib/animations/pick";
import { getSession } from "@/lib/auth/session";

// Cookie por persona (varias cuentas en un mismo navegador no se estorban) que dura 5 minutos: "ya entró por primera vez".
const cookieNameFor = (userId: string) => `mc_anim_${userId.slice(0, 8)}`;

/** La animación que toca reproducir ahora en Mi Panel, o null. Solo con las animaciones activadas en Congregación y si la persona no
 * entró en los últimos 5 minutos. No marca nada: la cookie se pone con POST cuando la animación de verdad empezó. */
export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	const none = () => NextResponse.json({ animation: null }, { headers: { "Cache-Control": "no-store" } });

	const db = getDb();
	const [cong] = await db.select({ enabled: congregations.animationsEnabled }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
	if (!cong?.enabled) return none();
	if ((await cookies()).get(cookieNameFor(session.userId))) return none();

	const animation = await pickAnimationFor(db, session.userId);
	return animation ? NextResponse.json({ animation }, { headers: { "Cache-Control": "no-store" } }) : none();
}

/** Marca que la animación ya empezó: durante los próximos 5 minutos no se vuelve a ofrecer. */
export async function POST() {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	const response = NextResponse.json({ ok: true });
	response.cookies.set(cookieNameFor(session.userId), "1", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ANIMATION_COOLDOWN_SECONDS });
	return response;
}
