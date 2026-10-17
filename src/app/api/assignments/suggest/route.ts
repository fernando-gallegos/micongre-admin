import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { suggestForMeeting } from "@/lib/assignments/plan";
import { assertCanAccessMidweekModule, assertCanAccessOperationalModule, assertCanAccessWeekendModule } from "@/lib/rbac/guards";

const bodySchema = z.object({
	module: z.enum(["midweek", "weekend", "operational-midweek", "operational-weekend"]),
	meetingId: z.string().min(1),
});

/** Propuesta de asignación automática para una reunión (solo lectura): por cada casilla vacía, la persona sugerida y los candidatos con sus
 * estadísticas de los últimos 3 meses. La pantalla la aplica a su borrador y se guarda con los endpoints de siempre. */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		const { module, meetingId } = parsed.data;

		if (module === "midweek") assertCanAccessMidweekModule(session);
		else if (module === "weekend") assertCanAccessWeekendModule(session);
		else assertCanAccessOperationalModule(session);

		try {
			return NextResponse.json(await suggestForMeeting(getDb(), module, meetingId));
		} catch (error) {
			if (error instanceof Error && error.message === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
			throw error;
		}
	} catch (error) {
		return errorResponse(error);
	}
}
