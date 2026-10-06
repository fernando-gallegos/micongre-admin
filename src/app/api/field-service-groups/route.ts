import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fieldServiceGroups, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessServiceGroupsModule } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { createFieldServiceGroupSchema } from "@/lib/validation/fieldServiceGroups";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessServiceGroupsModule(session);

		const overseer = alias(users, "overseer");
		const assistant = alias(users, "assistant");

		const db = getDb();
		const rows = await db
			.select({
				id: fieldServiceGroups.id,
				name: fieldServiceGroups.name,
				active: fieldServiceGroups.active,
				regularMeetingPlace: fieldServiceGroups.regularMeetingPlace,
				color: fieldServiceGroups.color,
				overseerUserId: fieldServiceGroups.overseerUserId,
				overseerName: overseer.fullName,
				assistantUserId: fieldServiceGroups.assistantUserId,
				assistantName: assistant.fullName,
				memberCount: sql<number>`(select count(*) from users where users.field_service_group_id = ${fieldServiceGroups.id} and users.is_hidden_admin = 0)`,
			})
			.from(fieldServiceGroups)
			.leftJoin(overseer, eq(overseer.id, fieldServiceGroups.overseerUserId))
			.leftJoin(assistant, eq(assistant.id, fieldServiceGroups.assistantUserId))
			.orderBy(asc(fieldServiceGroups.name));

		const groupIds = rows.map((g) => g.id);
		const memberRows = groupIds.length
			? await db
					.select({ id: users.id, fullName: users.fullName, fieldServiceGroupId: users.fieldServiceGroupId })
					.from(users)
					.where(and(inArray(users.fieldServiceGroupId, groupIds), notHiddenAdmin))
					.orderBy(asc(users.fullName))
			: [];

		// El superintendente y el auxiliar ya se muestran aparte en la tarjeta —
		// se excluyen del listado para no duplicarlos.
		const items = rows.map((g) => ({
			...g,
			members: memberRows
				.filter((m) => m.fieldServiceGroupId === g.id && m.id !== g.overseerUserId && m.id !== g.assistantUserId)
				.map(({ id, fullName }) => ({ id, fullName })),
		}));

		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessServiceGroupsModule(session);

		const parsed = createFieldServiceGroupSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const [created] = await db
			.insert(fieldServiceGroups)
			.values(parsed.data)
			.returning({ id: fieldServiceGroups.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
