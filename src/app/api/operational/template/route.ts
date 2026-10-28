import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { congregations, MEETING_TYPES, operationalTemplateSlots } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { chunked } from "@/lib/cleaning/meetings";
import {
	currentWeekStart,
	findDuplicatePosition,
	isTemplateConfigured,
	loadOperationalCatalog,
	loadTemplate,
	normalizePosition,
	syncUpcomingMeetings,
	type OperationalMeetingType,
	type TemplateSlot,
} from "@/lib/operational/template";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";

const putSchema = z.object({
	meetingType: z.enum(MEETING_TYPES),
	slots: z
		.array(z.object({ privilegeId: z.string().min(1), position: z.string().max(60).nullable().optional() }))
		.max(80),
});

// Plantilla de asignaciones de tareas operativas (pestaña «Plantilla»): GET la de ambos tipos de reunión y el catálogo de privilegios;
// PUT reemplaza la de un tipo y ajusta enseguida las reuniones desde la semana en curso (sin tocar asignaciones ocupadas).
export async function GET() {
	try {
		assertCanAccessOperationalModule(await getSession());
		const db = getDb();
		const [midweek, weekend, catalog] = await Promise.all([
			loadTemplate(db, "midweek"),
			loadTemplate(db, "weekend"),
			loadOperationalCatalog(db),
		]);
		return NextResponse.json({ midweek, weekend, catalog });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function PUT(request: Request) {
	try {
		assertCanAccessOperationalModule(await getSession());
		const parsed = putSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		const catalog = new Set((await loadOperationalCatalog(db)).map((p) => p.id));
		const slots: TemplateSlot[] = parsed.data.slots.map((s) => ({ privilegeId: s.privilegeId, position: normalizePosition(s.position) }));
		if (slots.some((s) => !catalog.has(s.privilegeId))) {
			return NextResponse.json({ error: "invalid_privilege", message: "Una de las asignaciones no es una tarea operativa." }, { status: 400 });
		}
		const duplicate = findDuplicatePosition(slots);
		if (duplicate) {
			return NextResponse.json(
				{ error: "duplicate_position", message: `El nombre «${duplicate.position}» está repetido en la misma tarea: ponle otro.` },
				{ status: 400 },
			);
		}

		const meetingType: OperationalMeetingType = parsed.data.meetingType;
		const rowsFor = (type: OperationalMeetingType, list: TemplateSlot[]) =>
			list.map((s, i) => ({ meetingType: type, privilegeId: s.privilegeId, position: s.position, sortOrder: i }));
		const rows = rowsFor(meetingType, slots);
		// La primera vez que se guarda, el otro tipo de reunión conserva la plantilla por omisión que tenía.
		if (!(await isTemplateConfigured(db))) {
			const other: OperationalMeetingType = meetingType === "midweek" ? "weekend" : "midweek";
			rows.push(...rowsFor(other, await loadTemplate(db, other)));
		}

		// Todo junto (D1 batch es una transacción): borrar la plantilla de este tipo, escribir la nueva y marcarla como configurada.
		const statements: BatchItem<"sqlite">[] = [db.delete(operationalTemplateSlots).where(eq(operationalTemplateSlots.meetingType, meetingType))];
		for (const chunk of chunked(rows, 15)) statements.push(db.insert(operationalTemplateSlots).values(chunk));
		statements.push(db.update(congregations).set({ operationalTemplateSet: true }));
		await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

		const applied = await syncUpcomingMeetings(db, currentWeekStart(), [meetingType]);
		return NextResponse.json({ ok: true, applied });
	} catch (error) {
		return errorResponse(error);
	}
}
