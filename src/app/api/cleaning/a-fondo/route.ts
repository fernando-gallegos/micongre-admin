import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningTasks } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse, invalidBody } from "@/lib/cleaning/http";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";
import { createThoroughSchema } from "@/lib/validation/cleaning";

// Programa una limpieza a fondo (por lo menos una vez al año; puede haber
// varias) en una fecha. Los responsables se agregan después, como en el resto.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const parsed = createThoroughSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const [task] = await getDb()
			.insert(cleaningTasks)
			.values({ kind: "a_fondo", taskDate: parsed.data.taskDate, notes: parsed.data.notes || null })
			.returning({ id: cleaningTasks.id });
		if (!task) throw new Error("cleaning_task_insert_failed");

		return NextResponse.json({ id: task.id }, { status: 201 });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
