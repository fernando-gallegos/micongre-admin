import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { isFcmEnabled } from "@/lib/push/dispatch";

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

	// Con Firebase configurado, el push del navegador se deja de usar.
	if (isFcmEnabled()) return NextResponse.json({ error: "push_disabled" }, { status: 404 });
	return NextResponse.json({ publicKey: getEnv().VAPID_PUBLIC_KEY });
}
