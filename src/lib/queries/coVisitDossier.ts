import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { fieldServiceGroups, monthlyAttendanceSummary, serviceReports, theocraticAppointments, users } from "@/db/schema";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { SERVICE_YEAR_MONTHS, calendarYearForServiceMonth, getCurrentServiceYear } from "@/lib/serviceYear";

const PIONEER_APPOINTMENT_TYPES = ["regular_pioneer", "special_pioneer", "missionary"] as const;

export interface CoVisitDossier {
	serviceYear: number;
	pioneers: {
		id: string;
		fullName: string;
		appointmentType: string;
		totalHours: number;
		creditHoursNotes: string[];
	}[];
	activeByGroup: { groupId: string | null; groupName: string; members: { id: string; fullName: string }[] }[];
	inactivePublishers: { id: string; fullName: string }[];
	attendance: {
		periodYear: number | null;
		periodMonth: number | null;
		meetingType: string | null;
		meetingsRecorded: number | null;
		totalInPerson: number | null;
		totalZoom: number | null;
	}[];
}

// Paquete S-61 (sin territorios ni cuentas — ver plan, las cuentas se
// gestionan en JW.ORG): concentrado de S-21 (precursores, publicadores
// activos por grupo, inactivos) y consolidado S-88 (asistencia) — todo
// derivado, sin tabla propia, mismo criterio que la tarjeta S-21 individual
// (publishers/[id]/s21/page.tsx).
export async function getCoVisitDossier(db: Database): Promise<CoVisitDossier> {
	const serviceYear = getCurrentServiceYear();
	// {año calendario}-{mes} válidos para el año de servicio actual — mismo
	// criterio que publishers/[id]/s21/page.tsx.
	const serviceYearPeriods = new Set(
		SERVICE_YEAR_MONTHS.map(({ month }) => `${calendarYearForServiceMonth(serviceYear, month)}-${month}`),
	);

	const [pioneerAppointments, groups, allActivePublishers, inactivePublishers, attendanceRows] = await Promise.all([
			db
				.select({
					userId: theocraticAppointments.userId,
					appointmentType: theocraticAppointments.appointmentType,
					fullName: users.fullName,
				})
				.from(theocraticAppointments)
				.innerJoin(users, eq(users.id, theocraticAppointments.userId))
				.where(
					and(
						isNull(theocraticAppointments.endDate),
						inArray(theocraticAppointments.appointmentType, [...PIONEER_APPOINTMENT_TYPES]),
						notHiddenAdmin,
					),
				),
			db
				.select({ id: fieldServiceGroups.id, name: fieldServiceGroups.name, color: fieldServiceGroups.color })
				.from(fieldServiceGroups),
			db
				.select({ id: users.id, fullName: users.fullName, fieldServiceGroupId: users.fieldServiceGroupId })
				.from(users)
				.where(and(eq(users.congregationStatus, "active"), notHiddenAdmin)),
			db
				.select({ id: users.id, fullName: users.fullName })
				.from(users)
				.where(and(eq(users.congregationStatus, "inactive"), notHiddenAdmin)),
			db.select().from(monthlyAttendanceSummary),
		]);

	const pioneerReports = pioneerAppointments.length
		? await db
				.select({
					userId: serviceReports.userId,
					hours: serviceReports.hours,
					creditHoursNote: serviceReports.creditHoursNote,
					periodYear: serviceReports.periodYear,
					periodMonth: serviceReports.periodMonth,
				})
				.from(serviceReports)
				.where(
					inArray(
						serviceReports.userId,
						pioneerAppointments.map((p) => p.userId),
					),
				)
		: [];

	const pioneers = pioneerAppointments.map((appt) => {
		const reportsForUser = pioneerReports.filter(
			(r) => r.userId === appt.userId && serviceYearPeriods.has(`${r.periodYear}-${r.periodMonth}`),
		);
		return {
			id: appt.userId,
			fullName: appt.fullName,
			appointmentType: appt.appointmentType,
			totalHours: reportsForUser.reduce((sum, r) => sum + (r.hours ?? 0), 0),
			creditHoursNotes: reportsForUser.map((r) => r.creditHoursNote).filter((n): n is string => !!n),
		};
	});

	const activeByGroup = [
		...groups.map((g) => ({
			groupId: g.id,
			groupName: g.name,
			groupColor: g.color,
			members: allActivePublishers
				.filter((p) => p.fieldServiceGroupId === g.id)
				.map(({ id, fullName }) => ({ id, fullName })),
		})),
		{
			groupId: null,
			groupName: "Sin grupo asignado",
			groupColor: null,
			members: allActivePublishers.filter((p) => !p.fieldServiceGroupId).map(({ id, fullName }) => ({ id, fullName })),
		},
	].filter((g) => g.members.length > 0);

	return {
		serviceYear,
		pioneers,
		activeByGroup,
		inactivePublishers,
		attendance: attendanceRows,
	};
}
