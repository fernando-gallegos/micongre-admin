import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isFcmEnabled } from "@/lib/push/dispatch";

// La app Android pregunta si este sitio usa push en tiempo real (Firebase); si no, sigue revisando por su cuenta.
export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	return NextResponse.json({ fcm: isFcmEnabled() });
}
