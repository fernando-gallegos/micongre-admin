import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningTasks } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse } from "@/lib/cleaning/http";
import { deleteTask } from "@/lib/cleaning/tasks";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";

// Solo las limpiezas a fondo se eliminan por id: las ligeras y profundas son
// "de" una reunión/semana y se limpian solas al quedar vacías.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);
		const { id } = await params;

		const db = getDb();
		const [task] = await db
			.select({ id: cleaningTasks.id })
			.from(cleaningTasks)
			.where(and(eq(cleaningTasks.id, id), eq(cleaningTasks.kind, "a_fondo")))
			.limit(1);
		if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

		await deleteTask(db, task.id);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
