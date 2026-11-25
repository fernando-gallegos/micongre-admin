import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { CaptainsFailure, listDayCaptains, saveDayCaptains } from "@/lib/preaching/captains";
import { assertCanAccessPreachingModule } from "@/lib/rbac/guards";
import { listAssignableUsers } from "@/lib/territories/service";

/** Flujo 2 de la predicación: capitanes fijos por día y tipo, y a quién se puede poner (quien puede recibir territorios de ese tipo). */
export async function GET() {
	try {
		assertCanAccessPreachingModule(await getSession());
		const db = getDb();
		const [captains, general, publicPreaching] = await Promise.all([
			listDayCaptains(db),
			listAssignableUsers(db, "general"),
			listAssignableUsers(db, "public_preaching"),
		]);
		return NextResponse.json({ captains, assignable: { general, public_preaching: publicPreaching } });
	} catch (error) {
		return errorResponse(error);
	}
}

const bodySchema = z.object({
	entries: z
		.array(
			z.object({
				weekday: z.number().int().min(1).max(7),
				kind: z.enum(["general", "public_preaching"]),
				userIds: z.array(z.string().min(1)).max(20),
			}),
		)
		.max(14),
});

/** Reemplaza los capitanes fijos (quien administra la predicación). */
export async function PUT(request: Request) {
	try {
		assertCanAccessPreachingModule(await getSession());
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		const db = getDb();
		await saveDayCaptains(db, parsed.data.entries);
		return NextResponse.json({ captains: await listDayCaptains(db) });
	} catch (error) {
		if (error instanceof CaptainsFailure) return NextResponse.json({ error: error.message }, { status: 400 });
		return errorResponse(error);
	}
}
