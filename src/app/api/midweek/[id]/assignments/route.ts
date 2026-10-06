import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { PRIVILEGE_IDS, SECTION_GROUP_BY_TYPE } from "@/lib/rbac/roles";
import { createAssignmentSchema } from "@/lib/validation/midweek";

// Agrega una parte de cantidad variable: "student_assignment" (Seamos
// mejores maestros, sin siembra automática porque su cantidad cambia cada
// semana — ver MIDWEEK_FIXED_SECTIONS) o "living_custom" (Nuestra vida
// cristiana, título libre, puede ubicarse en una posición específica dentro
// de esa sección en vez de agregarse siempre al final).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);
		const { id: meetingId } = await params;

		const parsed = createAssignmentSchema.safeParse(await request.json().catch(() => ({})));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const { sectionType, position } = parsed.data;
		const privilegeId =
			sectionType === "living_custom" ? PRIVILEGE_IDS.CHRISTIAN_LIVING : PRIVILEGE_IDS.STUDENT_ASSIGNMENT;

		const db = getDb();
		const rows = await db
			.select({ id: midweekAssignments.id, sectionType: midweekAssignments.sectionType, sequenceOrder: midweekAssignments.sequenceOrder })
			.from(midweekAssignments)
			.where(eq(midweekAssignments.meetingId, meetingId))
			.orderBy(asc(midweekAssignments.sequenceOrder));

		let targetSeq: number;
		if (position === undefined) {
			// Comportamiento de siempre: al final de toda la reunión.
			targetSeq = (rows.at(-1)?.sequenceOrder ?? 0) + 1;
		} else {
			const group = SECTION_GROUP_BY_TYPE[sectionType];
			const groupRows = rows.filter((r) => SECTION_GROUP_BY_TYPE[r.sectionType] === group);
			const pos = Math.min(Math.max(position, 1), groupRows.length + 1);
			targetSeq = pos <= groupRows.length ? groupRows[pos - 1].sequenceOrder : (rows.at(-1)?.sequenceOrder ?? 0) + 1;
		}

		const toShift = rows.filter((r) => r.sequenceOrder >= targetSeq);
		const [inserted] = await db.batch([
			db
				.insert(midweekAssignments)
				.values({
					meetingId,
					sectionType,
					privilegeId,
					sectionTitle: parsed.data.sectionTitle ?? null,
					description: parsed.data.description ?? null,
					sequenceOrder: targetSeq,
				})
				.returning({ id: midweekAssignments.id }),
			...toShift.map((r) =>
				db
					.update(midweekAssignments)
					.set({ sequenceOrder: r.sequenceOrder + 1 })
					.where(eq(midweekAssignments.id, r.id)),
			),
		]);

		return NextResponse.json({ id: inserted[0].id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
