import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse, invalidBody } from "@/lib/cleaning/http";
import { ensureTask, setCompleted } from "@/lib/cleaning/tasks";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";
import { completeCleaningSchema } from "@/lib/validation/cleaning";

// El recuadro del Cronograma: el coordinador de limpieza marca (o desmarca)
// que la limpieza se realizó, aunque esté a cargo de otra congregación.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const parsed = completeCleaningSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const db = getDb();
		const task = await ensureTask(db, parsed.data.ref);
		await setCompleted(db, task, parsed.data.done, session.userId);

		return NextResponse.json({ completedAt: parsed.data.done ? new Date() : null });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
