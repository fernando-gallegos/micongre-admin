import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse, invalidBody } from "@/lib/cleaning/http";
import { addAssignee, ensureTask, loadAssignees, validateAssignee } from "@/lib/cleaning/tasks";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";
import { addAssigneeSchema } from "@/lib/validation/cleaning";

// Agrega un responsable (grupo nuestro, toda nuestra congregación u otra
// congregación del salón) a una tarea, creándola si es la primera vez que se
// asigna esa reunión/semana. Asignar NO notifica — ver tasks/[id]/notify.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const parsed = addAssigneeSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return invalidBody(parsed.error);

		const db = getDb();
		await validateAssignee(db, parsed.data.assignee);
		const task = await ensureTask(db, parsed.data.ref);
		await addAssignee(db, task.id, parsed.data.assignee);

		return NextResponse.json({
			taskId: task.id,
			assignees: (await loadAssignees(db, [task.id])).get(task.id) ?? [],
		});
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
