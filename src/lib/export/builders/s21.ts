import { eq } from "drizzle-orm";
import { serviceReports, theocraticAppointments, users } from "@/db/schema";
import { formatShortDate } from "@/lib/dateFormat";
import { RbacError } from "@/lib/rbac/errors";
import { canEditReportsOf, canViewS21 } from "@/lib/rbac/guards";
import { calendarYearForServiceMonth, getCurrentServiceYear, SERVICE_YEAR_MONTHS } from "@/lib/serviceYear";
import type { BuilderContext } from "../registry";
import type { ReportDoc } from "../types";

// Las casillas de nombramiento que pide la hoja oficial S-21.
const S21_APPOINTMENT_CHECKBOXES: { type: string; label: string }[] = [
	{ type: "elder", label: "Anciano" },
	{ type: "ministerial_servant", label: "Siervo ministerial" },
	{ type: "regular_pioneer", label: "Precursor regular" },
	{ type: "special_pioneer", label: "Precursor especial" },
	{ type: "missionary", label: "Misionero que sirve en el campo" },
];

/** Tarjeta S-21 de un publicador para un año de servicio. */
export async function buildS21({ db, session, params }: BuilderContext): Promise<ReportDoc> {
	const userId = params.get("userId");
	if (!userId) throw new Error("missing_user");

	// Mismos permisos que la página de la S-21.
	const canEdit = await canEditReportsOf(db, session, userId);
	if (!canViewS21(session) && session.userId !== userId && !canEdit) {
		throw new RbacError("No tienes permiso para ver esta tarjeta S-21.");
	}

	const [publisher] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!publisher) throw new Error("not_found");

	const [appointments, reports] = await Promise.all([
		db
			.select({ appointmentType: theocraticAppointments.appointmentType, endDate: theocraticAppointments.endDate })
			.from(theocraticAppointments)
			.where(eq(theocraticAppointments.userId, userId)),
		db.select().from(serviceReports).where(eq(serviceReports.userId, userId)),
	]);
	const activeTypes = new Set<string>(appointments.filter((a) => !a.endDate).map((a) => a.appointmentType));
	const pioneerCapable = appointments.some((a) => a.appointmentType === "regular_pioneer");

	const requested = Number(params.get("serviceYear"));
	const serviceYear = Number.isInteger(requested) && requested > 1900 ? requested : getCurrentServiceYear();

	const reportByPeriod = new Map(reports.map((r) => [`${r.periodYear}-${r.periodMonth}`, r]));
	const monthRows = SERVICE_YEAR_MONTHS.map(({ month, label }) => ({
		label,
		report: reportByPeriod.get(`${calendarYearForServiceMonth(serviceYear, month)}-${month}`) ?? null,
	}));
	const totalHours = monthRows.reduce((sum, r) => sum + (r.report?.hours ?? 0), 0);
	const totalProjectHours = monthRows.reduce((sum, r) => sum + (r.report?.projectHours ?? 0), 0);
	const showProjectHours = pioneerCapable || totalProjectHours > 0;

	const activeLabels = S21_APPOINTMENT_CHECKBOXES.filter((a) => activeTypes.has(a.type)).map((a) => a.label);
	const gender = publisher.gender === "male" ? "Hombre" : publisher.gender === "female" ? "Mujer" : "—";

	const columns = [
		{ label: "Mes", width: 2 },
		{ label: "Participación en el ministerio", align: "center" as const },
		{ label: "Cursos bíblicos", align: "center" as const },
		{ label: "Precursor auxiliar", align: "center" as const },
		{ label: "Horas", align: "center" as const },
		...(showProjectHours ? [{ label: "Horas de proyectos", align: "center" as const }] : []),
		{ label: "Notas", width: 3 },
	];
	const rows = monthRows.map(({ label, report }) => [
		label,
		report?.participatedInMinistry ? "Sí" : "",
		report?.bibleStudiesCount || null,
		report?.isAuxiliaryPioneerThisMonth ? "Sí" : "",
		report?.hours || null,
		...(showProjectHours ? [report?.projectHours || null] : []),
		[report?.creditHoursNote, report?.comments].filter(Boolean).join(" · "),
	]);
	rows.push([
		"Total",
		"",
		// Los cursos bíblicos no se suman en el año de servicio (es la cantidad de cada mes).
		null,
		"",
		totalHours || null,
		...(showProjectHours ? [totalProjectHours || null] : []),
		"",
	]);

	return {
		title: "Registro de publicador de la congregación",
		fileName: `S-21 ${publisher.fullName} ${serviceYear}-${serviceYear + 1}`,
		footer: "Mi Congre",
		blocks: [
			{
				type: "keyValue",
				items: [
					{ label: "Nombre", value: publisher.fullName },
					{ label: "Fecha de nacimiento", value: publisher.birthDate ? formatShortDate(publisher.birthDate) : "—" },
					{ label: "Fecha de bautismo", value: publisher.baptismDate ? formatShortDate(publisher.baptismDate) : "—" },
					{ label: "Sexo", value: gender },
					{ label: "Nombramientos", value: activeLabels.length ? activeLabels.join(", ") : "—" },
				],
			},
			{ type: "heading", text: `Año de servicio: ${serviceYear}–${serviceYear + 1}`, level: 2 },
			{ type: "table", table: { sheetName: `${serviceYear}-${serviceYear + 1}`, columns, rows } },
		],
	};
}
