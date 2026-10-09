import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { runDailyJob } from "@/lib/jobs/daily";
import { cronSecret } from "@/lib/reminders/secret";

// Job diario: lo llama el propio Worker desde su cron (custom-worker.js, 5:00 a. m. de Nicaragua); no es una ruta para personas.
// Sin el secreto interno responde 404 como si no existiera. `?only=programs|congregations|reports` corre solo un paso.
export async function POST(request: Request) {
	const expected = await cronSecret(String(getEnv().JWT_SECRET ?? ""));
	if (!expected || request.headers.get("x-cron-secret") !== expected) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	try {
		const only = new URL(request.url).searchParams.get("only");
		return NextResponse.json(await runDailyJob(getDb(), new Date(), only === "programs" || only === "congregations" || only === "reports" ? only : undefined));
	} catch (error) {
		console.error("daily_job_failed", error);
		return NextResponse.json({ error: "internal_error" }, { status: 500 });
	}
}
