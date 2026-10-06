import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cleaningTasks } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse } from "@/lib/cleaning/http";
import { notifyTask } from "@/lib/cleaning/tasks";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";

// Botón "Enviar notificación" de UNA fila del módulo: avisa a los responsables
// de nuestra congregación (los de otras congregaciones no reciben nada). Cada
// aviso es una notificación normal que el destinatario puede ocultar; la
// asignación aparece en Mi Panel haya o no aviso.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);
		const { id } = await params;

		const db = getDb();
		const [task] = await db.select().from(cleaningTasks).where(eq(cleaningTasks.id, id)).limit(1);
		if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

		const { sent } = await notifyTask(db, task, session.userId);
		return NextResponse.json({ ok: true, sent, notifiedAt: new Date() });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
