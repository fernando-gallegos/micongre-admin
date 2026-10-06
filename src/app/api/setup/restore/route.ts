import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getEnv } from "@/lib/env";
import { setupFailureResponse } from "@/lib/setup/http";
import { restoreFromBackup } from "@/lib/setup/service";

// Igual que el resto de /api/setup/*: público, y se cierra solo (409) en cuanto
// existe un administrador.
export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => null);
		const result = await restoreFromBackup(getDb(), getEnv().DB, body);
		if ("error" in result) return setupFailureResponse(result);
		return NextResponse.json(result);
	} catch (error) {
		return errorResponse(error);
	}
}
