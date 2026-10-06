import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getEnv } from "@/lib/env";
import { setupFailureResponse } from "@/lib/setup/http";
import { importHourglass } from "@/lib/setup/service";

// Todas las rutas /api/setup/* son públicas a propósito (el middleware las
// deja pasar): corren cuando aún no hay ningún usuario que pueda iniciar
// sesión. Se cierran solas — cada una rechaza todo en cuanto existe un admin.
export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => null);
		const result = await importHourglass(getDb(), getEnv().DB, body);
		if ("error" in result) return setupFailureResponse(result);
		return NextResponse.json(result);
	} catch (error) {
		return errorResponse(error);
	}
}
