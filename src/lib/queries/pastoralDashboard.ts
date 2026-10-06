import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { pastoralFlags, serviceReports, theocraticAppointments, users } from "@/db/schema";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { SERVICE_YEAR_MONTHS, calendarYearForServiceMonth, getCurrentServiceYear } from "@/lib/serviceYear";

const PIONEER_APPOINTMENT_TYPES = ["regular_pioneer", "special_pioneer", "missionary"] as const;
const REGULAR_PIONEER_ANNUAL_GOAL_HOURS = 600;

export interface PriorityMatrixEntry {
	id: string;
	fullName: string;
	noReportLastMonth: boolean;
	recentlyBaptized: boolean;
	reducedReportEligible: boolean;
	hasOpenPastoralFlag: boolean;
}

// Matriz de priorización (sfg cap. 2): solo devuelve publicadores activos con
// al menos una bandera de prioridad alta encendida.
export async function getPriorityMatrix(db: Database): Promise<PriorityMatrixEntry[]> {
	const now = new Date();
	const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const prevYear = prevMonthDate.getFullYear();
	const prevMonth = prevMonthDate.getMonth() + 1;
	const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

	const [activePublishers, prevMonthReports, openFlags] = await Promise.all([
		db
			.select({
				id: users.id,
				fullName: users.fullName,
				baptismDate: users.baptismDate,
				isEligibleForReducedReport: users.isEligibleForReducedReport,
			})
			.from(users)
			.where(and(eq(users.congregationStatus, "active"), notHiddenAdmin)),
		db.select({ userId: serviceReports.userId }).from(serviceReports).where(
			and(eq(serviceReports.periodYear, prevYear), eq(serviceReports.periodMonth, prevMonth)),
		),
		db.select({ publisherId: pastoralFlags.publisherId }).from(pastoralFlags).where(isNull(pastoralFlags.resolvedAt)),
	]);

	const reportedUserIds = new Set(prevMonthReports.map((r) => r.userId));
	const flaggedUserIds = new Set(openFlags.map((f) => f.publisherId));

	return activePublishers
		.map((p) => ({
			id: p.id,
			fullName: p.fullName,
			noReportLastMonth: !reportedUserIds.has(p.id),
			recentlyBaptized: !!p.baptismDate && p.baptismDate >= twelveMonthsAgo,
			reducedReportEligible: p.isEligibleForReducedReport,
			hasOpenPastoralFlag: flaggedUserIds.has(p.id),
		}))
		.filter((p) => p.noReportLastMonth || p.recentlyBaptized || p.reducedReportEligible || p.hasOpenPastoralFlag);
}

export interface PioneerPaceAlert {
	id: string;
	fullName: string;
	hoursSoFar: number;
	expectedByNow: number;
}

// sfg 14:5: al 1 de marzo, un precursor regular debería llevar la mitad de
// las 600h anuales (sept-feb = 6 de los 12 meses del año de servicio).
export async function getPioneerPaceAlerts(db: Database): Promise<PioneerPaceAlert[]> {
	const serviceYear = getCurrentServiceYear();
	const marchFirst = new Date(serviceYear + 1, 2, 1);
	if (new Date() < marchFirst) return [];

	const checkPeriods = new Set(
		SERVICE_YEAR_MONTHS.slice(0, 6).map(({ month }) => `${calendarYearForServiceMonth(serviceYear, month)}-${month}`),
	);
	const expectedByNow = REGULAR_PIONEER_ANNUAL_GOAL_HOURS / 2;

	const pioneers = await db
		.select({ userId: theocraticAppointments.userId, fullName: users.fullName })
		.from(theocraticAppointments)
		.innerJoin(users, eq(users.id, theocraticAppointments.userId))
		.where(
			and(
				isNull(theocraticAppointments.endDate),
				eq(theocraticAppointments.appointmentType, "regular_pioneer"),
				notHiddenAdmin,
			),
		);
	if (pioneers.length === 0) return [];

	const reports = await db
		.select({ userId: serviceReports.userId, hours: serviceReports.hours, periodYear: serviceReports.periodYear, periodMonth: serviceReports.periodMonth })
		.from(serviceReports)
		.where(
			inArray(
				serviceReports.userId,
				pioneers.map((p) => p.userId),
			),
		);

	return pioneers
		.map((p) => {
			const hoursSoFar = reports
				.filter((r) => r.userId === p.userId && checkPeriods.has(`${r.periodYear}-${r.periodMonth}`))
				.reduce((sum, r) => sum + (r.hours ?? 0), 0);
			return { id: p.userId, fullName: p.fullName, hoursSoFar, expectedByNow };
		})
		.filter((p) => p.hoursSoFar < p.expectedByNow);
}

export interface MonthlyServiceAggregate {
	periodYear: number;
	periodMonth: number;
	publishersReportingCount: number;
	totalHoursPioneers: number;
	totalBibleStudies: number;
}

export async function getMonthlyServiceAggregates(db: Database, months = 12): Promise<MonthlyServiceAggregate[]> {
	const now = new Date();
	const periods = Array.from({ length: months }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		return { periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 };
	});
	const earliest = periods[periods.length - 1];

	const [reports, pioneers] = await Promise.all([
		db
			.select({
				userId: serviceReports.userId,
				periodYear: serviceReports.periodYear,
				periodMonth: serviceReports.periodMonth,
				hours: serviceReports.hours,
				bibleStudiesCount: serviceReports.bibleStudiesCount,
				participatedInMinistry: serviceReports.participatedInMinistry,
			})
			.from(serviceReports)
			.where(eq(serviceReports.periodYear, earliest.periodYear)),
		db
			.select({ userId: theocraticAppointments.userId })
			.from(theocraticAppointments)
			.where(
				and(
					isNull(theocraticAppointments.endDate),
					inArray(theocraticAppointments.appointmentType, [...PIONEER_APPOINTMENT_TYPES]),
				),
			),
	]);

	// La consulta de arriba solo filtra por el año más antiguo del rango (para
	// no traer toda la tabla) — si el rango cruza un cambio de año, se trae el
	// resto con una segunda pasada simple.
	const allReports =
		earliest.periodYear === now.getFullYear()
			? reports
			: [
					...reports,
					...(await db.select({
						userId: serviceReports.userId,
						periodYear: serviceReports.periodYear,
						periodMonth: serviceReports.periodMonth,
						hours: serviceReports.hours,
						bibleStudiesCount: serviceReports.bibleStudiesCount,
						participatedInMinistry: serviceReports.participatedInMinistry,
					}).from(serviceReports).where(eq(serviceReports.periodYear, now.getFullYear()))),
				];

	const pioneerIds = new Set(pioneers.map((p) => p.userId));

	return periods
		.map(({ periodYear, periodMonth }) => {
			const rows = allReports.filter((r) => r.periodYear === periodYear && r.periodMonth === periodMonth);
			return {
				periodYear,
				periodMonth,
				publishersReportingCount: rows.filter((r) => r.participatedInMinistry).length,
				totalHoursPioneers: rows.filter((r) => pioneerIds.has(r.userId)).reduce((sum, r) => sum + (r.hours ?? 0), 0),
				totalBibleStudies: rows.reduce((sum, r) => sum + (r.bibleStudiesCount ?? 0), 0),
			};
		})
		.reverse();
}
