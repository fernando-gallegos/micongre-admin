import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { setupFailureResponse } from "@/lib/setup/http";
import { assertSetupOpen, getSetupCongregation, saveCongregation } from "@/lib/setup/service";
import { setupCongregationSchema } from "@/lib/validation/setup";

export async function GET() {
	try {
		const db = getDb();
		const closed = await assertSetupOpen(db);
		if (closed) return setupFailureResponse(closed);
		return NextResponse.json(await getSetupCongregation(db));
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PUT(request: Request) {
	try {
		const parsed = setupCongregationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const db = getDb();
		const closed = await assertSetupOpen(db);
		if (closed) return setupFailureResponse(closed);
		await saveCongregation(db, parsed.data);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
