import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { setSessionCookies } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/env";
import { setupFailureResponse } from "@/lib/setup/http";
import { createSetupAdmin } from "@/lib/setup/service";
import { setupAdminSchema } from "@/lib/validation/setup";

export async function POST(request: Request) {
	try {
		const parsed = setupAdminSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const env = getEnv();
		const result = await createSetupAdmin(getDb(), env.DB, env.JWT_SECRET, parsed.data);
		if ("error" in result) return setupFailureResponse(result);

		const response = NextResponse.json({ ok: true });
		setSessionCookies(response, result.accessToken, result.refreshToken, "web");
		return response;
	} catch (error) {
		return errorResponse(error);
	}
}
