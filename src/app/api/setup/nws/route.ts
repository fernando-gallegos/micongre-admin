import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getEnv } from "@/lib/env";
import { setupFailureResponse } from "@/lib/setup/http";
import { importNws } from "@/lib/setup/service";

// CSV de NWScheduler en bruto (cada uno se reconoce por su contenido). Público
// y autocerrable como el resto de /api/setup/*.
const bodySchema = z.object({ files: z.array(z.string().max(20_000_000)).min(1).max(10) });

export async function POST(request: Request) {
	try {
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_nws" }, { status: 400 });

		const result = await importNws(getDb(), getEnv().DB, parsed.data.files);
		if ("error" in result) return setupFailureResponse(result);
		return NextResponse.json(result);
	} catch (error) {
		return errorResponse(error);
	}
}
