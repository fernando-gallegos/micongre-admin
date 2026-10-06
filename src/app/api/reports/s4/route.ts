import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { serviceReports, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { clampProjectHours } from "@/lib/reports/projectHours";
import { getPioneerAppointmentType } from "@/lib/rbac/eligibility";
import { assertCanManageReport, getReportsGroupIds } from "@/lib/rbac/guards";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { upsertS4ReportSchema } from "@/lib/validation/reports";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const now = new Date();
		const year = Number(searchParams.get("year") ?? now.getFullYear());
		const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

		const db = getDb();

		const scopeConditions = [eq(users.congregationStatus, "active"), notHiddenAdmin];
		const groupIds = await getReportsGroupIds(db, session);
		if (groupIds !== null) {
			if (groupIds.length === 0) {
				return NextResponse.json({ error: "no_managed_groups" }, { status: 403 });
			}
			scopeConditions.push(inArray(users.fieldServiceGroupId, groupIds));
		}

		const rows = await db
			.select({
				userId: users.id,
				fullName: users.fullName,
				reportId: serviceReports.id,
				participatedInMinistry: serviceReports.participatedInMinistry,
				isAuxiliaryPioneerThisMonth: serviceReports.isAuxiliaryPioneerThisMonth,
				hours: serviceReports.hours,
				projectHours: serviceReports.projectHours,
				bibleStudiesCount: serviceReports.bibleStudiesCount,
				status: serviceReports.status,
				pioneerType: theocraticAppointments.appointmentType,
			})
			.from(users)
			.leftJoin(
				serviceReports,
				and(
					eq(serviceReports.userId, users.id),
					eq(serviceReports.periodYear, year),
					eq(serviceReports.periodMonth, month),
				),
			)
			.leftJoin(
				theocraticAppointments,
				and(
					eq(theocraticAppointments.userId, users.id),
					isNull(theocraticAppointments.endDate),
					inArray(theocraticAppointments.appointmentType, ["auxiliary_pioneer", "regular_pioneer"]),
				),
			)
			.where(and(...scopeConditions))
			.orderBy(asc(users.fullName));

		return NextResponse.json({ items: rows, year, month });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const parsed = upsertS4ReportSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		await assertCanManageReport(db, session, parsed.data.userId);

		const pioneerType = await getPioneerAppointmentType(db, parsed.data.userId);

		const values = {
			...parsed.data,
			isAuxiliaryPioneerThisMonth: pioneerType === "auxiliary_pioneer",
			hours: pioneerType ? (parsed.data.hours ?? null) : null,
			projectHours:
				pioneerType === "regular_pioneer" ? clampProjectHours(parsed.data.hours, parsed.data.projectHours) : null,
			enteredByUserId: session.userId,
			submittedAt: new Date(),
			status: "submitted" as const,
		};

		await db
			.insert(serviceReports)
			.values(values)
			.onConflictDoUpdate({
				target: [serviceReports.userId, serviceReports.periodYear, serviceReports.periodMonth],
				set: values,
			});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
