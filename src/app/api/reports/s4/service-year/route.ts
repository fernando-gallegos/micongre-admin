import { and, eq, gte, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { serviceReports } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { getPioneerAppointmentType } from "@/lib/rbac/eligibility";
import { calendarYearForServiceMonth, getCurrentServiceYear, SERVICE_YEAR_MONTHS } from "@/lib/serviceYear";

// Tarjeta de precursor regular en Mi Panel: cuánto lleva de horas en el año
// de servicio actual (sept-ago) — solo lo pide esa tarjeta, por eso no
// reutiliza /api/reports/s4/mine (que es mes a mes).
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		const pioneerType = await getPioneerAppointmentType(db, session.userId);

		const serviceYear = getCurrentServiceYear();
		const rows = await db
			.select({ periodYear: serviceReports.periodYear, periodMonth: serviceReports.periodMonth, hours: serviceReports.hours, projectHours: serviceReports.projectHours })
			.from(serviceReports)
			.where(
				and(
					eq(serviceReports.userId, session.userId),
					or(
						and(eq(serviceReports.periodYear, serviceYear), gte(serviceReports.periodMonth, 9)),
						and(eq(serviceReports.periodYear, serviceYear + 1), lte(serviceReports.periodMonth, 8)),
					),
				),
			);
		const hours = rows.reduce((sum, r) => sum + (r.hours ?? 0) + (r.projectHours ?? 0), 0);

		// Horas de cada mes del año de servicio (septiembre a agosto, servicio + proyectos): la app las dibuja en el widget de precursorado.
		const byMonth = new Map(rows.map((r) => [`${r.periodYear}-${r.periodMonth}`, (r.hours ?? 0) + (r.projectHours ?? 0)]));
		const months = SERVICE_YEAR_MONTHS.map(({ month }) => {
			const year = calendarYearForServiceMonth(serviceYear, month);
			return { year, month, hours: byMonth.get(`${year}-${month}`) ?? 0 };
		});

		return NextResponse.json({ isRegularPioneer: pioneerType === "regular_pioneer", serviceYear, hours, months });
	} catch (error) {
		return errorResponse(error);
	}
}
