import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { runAssignmentReminders } from "@/lib/reminders/run";
import { cronSecret } from "@/lib/reminders/secret";

// Lo llama el propio Worker desde su cron (custom-worker.js, cada hora); no es una ruta para personas. Sin el secreto
// interno responde 404 como si no existiera. `?force=1` (con el secreto) ignora día, hora y "ya se envió hoy".
export async function POST(request: Request) {
	const expected = await cronSecret(String(getEnv().JWT_SECRET ?? ""));
	if (!expected || request.headers.get("x-cron-secret") !== expected) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	try {
		const force = new URL(request.url).searchParams.get("force") === "1";
		return NextResponse.json(await runAssignmentReminders(getDb(), new Date(), force));
	} catch (error) {
		console.error("reminders_failed", error);
		return NextResponse.json({ error: "internal_error" }, { status: 500 });
	}
}
