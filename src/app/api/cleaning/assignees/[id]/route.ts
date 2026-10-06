import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse } from "@/lib/cleaning/http";
import { removeAssignee } from "@/lib/cleaning/tasks";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";

// Quita un responsable y el aviso que se le hubiera enviado.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);
		const { id } = await params;

		const removed = await removeAssignee(getDb(), id);
		if (!removed) return NextResponse.json({ error: "assignee_not_found" }, { status: 404 });
		return NextResponse.json({ ok: true });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
