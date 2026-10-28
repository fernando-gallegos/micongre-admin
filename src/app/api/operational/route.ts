import { and, asc, eq, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { operationalSchedules, privileges, users } from "@/db/schema";
import { loadTemplate, slotDisplayName, sortByTemplate, syncMeetingsToTemplate } from "@/lib/operational/template";
import { errorResponse } from "@/lib/api/errors";
import { checkOperationalCollisions } from "@/lib/collision";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessOperationalModule } from "@/lib/rbac/guards";
import { NON_MEETING_OPERATIONAL_IDS } from "@/lib/rbac/roles";
import { createOperationalSlotSchema } from "@/lib/validation/operational";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);

		const { searchParams } = new URL(request.url);
		const meetingTypeParam = searchParams.get("meetingType");
		const meetingId = searchParams.get("meetingId");
		if ((meetingTypeParam !== "midweek" && meetingTypeParam !== "weekend") || !meetingId) {
			return NextResponse.json({ error: "missing_meeting" }, { status: 400 });
		}
		const meetingType: "midweek" | "weekend" = meetingTypeParam;

		const db = getDb();

		// Primera vez que se abre esta reunión: se arma con los puestos de la plantilla de la congregación
		// (pestaña «Puestos»). Después la mantienen al día el guardado de la plantilla y el job diario.
		const existingCount = await db
			.select({ id: operationalSchedules.id })
			.from(operationalSchedules)
			.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)))
			.limit(1);
		if (existingCount.length === 0) await syncMeetingsToTemplate(db, meetingType, [meetingId]);

		const rows = await db
			.select({
				id: operationalSchedules.id,
				privilegeId: operationalSchedules.privilegeId,
				privilegeName: privileges.name,
				position: operationalSchedules.position,
				assignedUserId: operationalSchedules.assignedUserId,
				assignedUserName: users.fullName,
			})
			.from(operationalSchedules)
			.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
			.leftJoin(users, eq(users.id, operationalSchedules.assignedUserId))
			// Puestos sembrados antes con privilegios que no son de reunión (predicación, territorios): ya no se muestran.
			.where(
				and(
					eq(operationalSchedules.meetingType, meetingType),
					eq(operationalSchedules.meetingId, meetingId),
					notInArray(operationalSchedules.privilegeId, NON_MEETING_OPERATIONAL_IDS),
				),
			)
			.orderBy(asc(privileges.name));

		// En el orden de la plantilla de la congregación.
		const ordered = sortByTemplate(rows, await loadTemplate(db, meetingType), (r) => slotDisplayName(r.privilegeName, r.position));
		const items = await Promise.all(
			ordered.map(async (row) => ({
				...row,
				warnings: row.assignedUserId
					? await checkOperationalCollisions(db, meetingType, meetingId, row.assignedUserId, row.id)
					: [],
			})),
		);

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessOperationalModule(session);

		const parsed = createOperationalSlotSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db
			.insert(operationalSchedules)
			.values(parsed.data)
			.returning({ id: operationalSchedules.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
