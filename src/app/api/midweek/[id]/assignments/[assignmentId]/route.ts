import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule, assertEligibleForAssignment } from "@/lib/rbac/guards";
import { isValidAssistantPairing } from "@/lib/rbac/eligibility";
import { RbacError } from "@/lib/rbac/errors";
import { getStudentPartRule } from "@/lib/rbac/studentParts";
import { updateAssignmentSchema } from "@/lib/validation/midweek";

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { assignmentId } = await params;

		const parsed = updateAssignmentSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [assignment] = await db
			.select()
			.from(midweekAssignments)
			.where(eq(midweekAssignments.id, assignmentId))
			.limit(1);
		if (!assignment) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const nextMainId =
			parsed.data.mainAssigneeId !== undefined ? parsed.data.mainAssigneeId : assignment.mainAssigneeId;
		let nextAssistantId =
			parsed.data.assistantAssigneeId !== undefined
				? parsed.data.assistantAssigneeId
				: assignment.assistantAssigneeId;
		const nextTitle =
			parsed.data.sectionTitle !== undefined ? parsed.data.sectionTitle : assignment.sectionTitle;

		// Reglas S-38 por título de parte de estudiante (Empecemos
		// conversaciones/Hagamos revisitas/¿Qué dirías?/Hagamos discípulos/
		// Discurso/Expliquemos nuestras creencias) — las demás secciones no
		// tienen esta noción, `rule` queda null para ellas.
		const rule = assignment.sectionType === "student_assignment" ? getStudentPartRule(nextTitle) : null;
		const update: typeof parsed.data = { ...parsed.data };

		if (rule && !rule.hasHelper) {
			if (parsed.data.assistantAssigneeId) {
				throw new RbacError(`Esta asignación ("${nextTitle}") no admite ayudante (S-38).`);
			}
			if (nextAssistantId) {
				// El título cambió a uno sin ayudante y ya había uno cargado — se limpia solo.
				nextAssistantId = null;
				update.assistantAssigneeId = null;
			}
		}

		// Revalida elegibilidad en el servidor antes de escribir — nunca confía
		// en que el cliente mandó una opción que realmente venía del selector.
		if (assignment.privilegeId && nextMainId) {
			await assertEligibleForAssignment(db, assignment.privilegeId, nextMainId);
		}

		if (rule?.requiresMale && nextMainId) {
			const [mainUser] = await db
				.select({ gender: users.gender })
				.from(users)
				.where(eq(users.id, nextMainId))
				.limit(1);
			if (!mainUser) return NextResponse.json({ error: "not_found" }, { status: 404 });
			if (mainUser.gender !== "male") {
				throw new RbacError(`Esta asignación ("${nextTitle}") requiere un hermano varón (S-38).`);
			}
		}

		if (nextAssistantId && nextMainId) {
			const [mainUser, assistantUser] = await db
				.select({ id: users.id, gender: users.gender, householdId: users.householdId })
				.from(users)
				.where(inArray(users.id, [nextMainId, nextAssistantId]))
				.then((rows) => [
					rows.find((r) => r.id === nextMainId) ?? null,
					rows.find((r) => r.id === nextAssistantId) ?? null,
				]);

			if (!mainUser || !assistantUser) {
				return NextResponse.json({ error: "not_found" }, { status: 404 });
			}
			if (!isValidAssistantPairing(mainUser, assistantUser)) {
				throw new RbacError("El ayudante debe ser del mismo sexo o familiar (S-38 párr. 7,8,10).");
			}
		}

		await db
			.update(midweekAssignments)
			.set(update)
			.where(and(eq(midweekAssignments.id, assignmentId)));

		// Asignar no notifica: el push sale solo al presionar "Enviar" (ver
		// ../../notify/route.ts).
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { assignmentId } = await params;

		const db = getDb();
		const [assignment] = await db
			.select({ sectionType: midweekAssignments.sectionType })
			.from(midweekAssignments)
			.where(eq(midweekAssignments.id, assignmentId))
			.limit(1);

		if (!assignment) return NextResponse.json({ error: "not_found" }, { status: 404 });
		if (!["student_assignment", "living_custom"].includes(assignment.sectionType)) {
			throw new RbacError("Solo se pueden quitar asignaciones estudiantiles o personalizadas — las demás secciones son fijas.");
		}

		await db.delete(midweekAssignments).where(eq(midweekAssignments.id, assignmentId));
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
