import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { fieldServiceGroups, serviceReports, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getReportsGroupIds } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

/** Informes de un mes agrupados por grupo de servicio (grupos en orden alfabético, personas en orden alfabético; los que no tienen grupo, al final). Mismo alcance que la tabla S-4: quien solo ve un grupo, solo recibe ese. */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const now = new Date();
		const year = Number(searchParams.get("year") ?? now.getFullYear());
		const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

		const db = getDb();
		const scope = [eq(users.congregationStatus, "active"), notHiddenAdmin];
		const groupIds = await getReportsGroupIds(db, session);
		if (groupIds !== null) {
			if (groupIds.length === 0) return NextResponse.json({ error: "no_managed_groups" }, { status: 403 });
			scope.push(inArray(users.fieldServiceGroupId, groupIds));
		}

		const rows = await db
			.select({
				userId: users.id,
				fullName: users.fullName,
				groupId: users.fieldServiceGroupId,
				reportId: serviceReports.id,
				participatedInMinistry: serviceReports.participatedInMinistry,
				isAuxiliaryPioneerThisMonth: serviceReports.isAuxiliaryPioneerThisMonth,
				hours: serviceReports.hours,
				projectHours: serviceReports.projectHours,
				bibleStudiesCount: serviceReports.bibleStudiesCount,
				comments: serviceReports.comments,
				pioneerType: theocraticAppointments.appointmentType,
			})
			.from(users)
			.leftJoin(
				serviceReports,
				and(eq(serviceReports.userId, users.id), eq(serviceReports.periodYear, year), eq(serviceReports.periodMonth, month)),
			)
			.leftJoin(
				theocraticAppointments,
				and(
					eq(theocraticAppointments.userId, users.id),
					isNull(theocraticAppointments.endDate),
					inArray(theocraticAppointments.appointmentType, ["auxiliary_pioneer", "regular_pioneer"]),
				),
			)
			.where(and(...scope))
			.orderBy(asc(users.fullName));

		const groupRows = await db.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name }).from(fieldServiceGroups);
		const names = new Map(groupRows.map((g) => [g.id, g.name]));

		const byGroup = new Map<string | null, typeof rows>();
		for (const row of rows) {
			const key = row.groupId && names.has(row.groupId) ? row.groupId : null;
			byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
		}
		const groups = [...byGroup.entries()]
			.map(([id, items]) => ({
				id,
				name: id ? (names.get(id) as string) : "Sin grupo",
				items: items.map(({ groupId: _g, ...rest }) => rest),
			}))
			.sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : a.name.localeCompare(b.name, "es", { numeric: true })));

		return NextResponse.json({ groups, year, month });
	} catch (error) {
		return errorResponse(error);
	}
}
