import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { runDailyJob } from "@/lib/jobs/daily";
import { requireAdmin } from "@/lib/rbac/guards";
import { runAssignmentReminders } from "@/lib/reminders/run";

const schema = z.object({ job: z.enum(["daily", "assignments"]) });

// Dispara a mano el Job diario o el Job de asignaciones (solo administradores). El de asignaciones se fuerza: ignora el día,
// la hora y "ya se envió hoy", y avisa de verdad a quienes tengan asignaciones.
export async function POST(request: Request) {
	try {
		requireAdmin(await getSession());
		const parsed = schema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		const db = getDb();
		if (parsed.data.job === "daily") return NextResponse.json({ job: "daily", result: await runDailyJob(db) });
		return NextResponse.json({ job: "assignments", result: await runAssignmentReminders(db, new Date(), true) });
	} catch (error) {
		return errorResponse(error);
	}
}
