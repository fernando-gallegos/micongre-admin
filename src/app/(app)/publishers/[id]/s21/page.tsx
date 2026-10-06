import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { serviceReports, theocraticAppointments, users } from "@/db/schema";
import { BackIconButton, S21ModeButton } from "@/components/publishers/HeaderIcons";
import { ExportButton } from "@/components/export/ExportButton";
import { S21Editor } from "@/components/publishers/S21Editor";
import { ServiceYearSelect } from "@/components/publishers/ServiceYearSelect";
import { getSession } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/dateFormat";
import { canEditReportsOf, canViewS21 } from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/ui/Layout";
import {
	SERVICE_YEAR_MONTHS,
	calendarYearForServiceMonth,
	getCurrentServiceYear,
	getServiceYear,
} from "@/lib/serviceYear";

// Los 5 nombramientos que el formulario oficial S-21 pide como casillas —
// no los 20 tipos que maneja el resto de la app.
const S21_APPOINTMENT_CHECKBOXES: { type: string; label: string }[] = [
	{ type: "elder", label: "Anciano" },
	{ type: "ministerial_servant", label: "Siervo ministerial" },
	{ type: "regular_pioneer", label: "Precursor regular" },
	{ type: "special_pioneer", label: "Precursor especial" },
	{ type: "missionary", label: "Misionero que sirve en el campo" },
];

export default async function PublisherS21Page({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ serviceYear?: string; edit?: string }>;
}) {
	const session = await getSession();

	const { id } = await params;
	if (!session) redirect("/panel");
	const { serviceYear: serviceYearParam, edit: editParam } = await searchParams;
	const db = getDb();

	// Cada publicador puede ver su propia tarjeta; la de otros requiere el
	// privilegio de recolección de informes o poder editar sus informes
	// (informes del grupo / todos). Quien puede editar ve el botón de modo
	// edición; por defecto la tarjeta se abre en solo lectura.
	const canEdit = await canEditReportsOf(db, session, id);
	if (!canViewS21(session) && session.userId !== id && !canEdit) redirect("/panel");
	const editing = canEdit && editParam === "1";

	const [publisher] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!publisher) notFound();

	const [appointments, reports] = await Promise.all([
		db
			.select({ appointmentType: theocraticAppointments.appointmentType, endDate: theocraticAppointments.endDate })
			.from(theocraticAppointments)
			.where(eq(theocraticAppointments.userId, id)),
		db.select().from(serviceReports).where(eq(serviceReports.userId, id)),
	]);
	const activeTypes = new Set<string>(appointments.filter((a) => !a.endDate).map((a) => a.appointmentType));
	// Tiene o tuvo precursorado regular: sus meses llevan horas (las fechas de
	// inicio importadas no son confiables, así que no se acota por fecha).
	const pioneerCapable = appointments.some((a) => a.appointmentType === "regular_pioneer");

	const currentServiceYear = getCurrentServiceYear();
	const reportYears = reports.map((r) => getServiceYear(r.periodYear, r.periodMonth));
	// Para cargar informes retroactivos hacen falta años que aún no tienen ninguno:
	// en edición se ofrecen desde el bautismo (o al menos 5 años atrás).
	let oldestOffered = Math.min(currentServiceYear, ...reportYears);
	if (editing) {
		const baptismYear = publisher.baptismDate ? Number(publisher.baptismDate.slice(0, 4)) : NaN;
		oldestOffered = Math.max(
			Math.min(oldestOffered, currentServiceYear - 4, Number.isFinite(baptismYear) ? baptismYear : Infinity),
			currentServiceYear - 40,
		);
	}
	const availableServiceYears = Array.from(
		new Set([
			currentServiceYear,
			...reportYears,
			...Array.from({ length: currentServiceYear - oldestOffered + 1 }, (_, i) => currentServiceYear - i),
		]),
	).sort((a, b) => b - a);

	const selectedServiceYear = serviceYearParam ? Number(serviceYearParam) : currentServiceYear;
	const serviceYear = availableServiceYears.includes(selectedServiceYear)
		? selectedServiceYear
		: currentServiceYear;

	const reportByPeriod = new Map(reports.map((r) => [`${r.periodYear}-${r.periodMonth}`, r]));
	const monthRows = SERVICE_YEAR_MONTHS.map(({ month, label }) => {
		const calendarYear = calendarYearForServiceMonth(serviceYear, month);
		return { label, month, calendarYear, report: reportByPeriod.get(`${calendarYear}-${month}`) ?? null };
	});
	const totalHours = monthRows.reduce((sum, r) => sum + (r.report?.hours ?? 0), 0);
	const totalProjectHours = monthRows.reduce((sum, r) => sum + (r.report?.projectHours ?? 0), 0);
	const showProjectHours = pioneerCapable || totalProjectHours > 0;

	// La ficha solo la abren el admin y quienes tienen permisos de publicadores.
	const canOpenFicha =
		session.role === "admin" ||
		session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL) ||
		session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_GROUP);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5 print:max-w-none">
			<div className="flex flex-col gap-3 print:hidden">
				<div className="-mx-2 flex items-center justify-between">
					<BackIconButton href={canOpenFicha ? `/publishers/${id}` : "/panel"} label={canOpenFicha ? "Volver a la ficha" : "Volver a Mi panel"} />
					{canEdit && (
						<S21ModeButton href={`?serviceYear=${serviceYear}${editing ? "" : "&edit=1"}`} editing={editing} />
					)}
				</div>
				<PageHeader title="Tarjeta S-21" subtitle={publisher.fullName} />
				<div className="flex items-center gap-2">
					<ServiceYearSelect years={availableServiceYears} selected={serviceYear} />
					<ExportButton
						kind="s21"
						params={{ userId: id, serviceYear: String(serviceYear) }}
						formats={["docx", "png", "xlsx"]}
						label="Descargar tarjeta S-21"
						title="Descargar tarjeta S-21"
					/>
				</div>
			</div>

			{editing && (
				<p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-ink print:hidden">
					Modo edición: cambia cada mes y guárdalo con el botón de su línea (o con Enter). Los meses en blanco no crean informe.
				</p>
			)}

			{/* En pantallas angostas la hoja conserva su tamaño y se desplaza de lado, para verse como la S-21 impresa. */}
			<div className="relative overflow-x-auto print:overflow-visible">
			<div className="w-full min-w-max border border-gray-800 bg-white p-5 text-sm text-gray-900 print:min-w-0 print:border-black">
				<h2 className="text-center text-base font-bold uppercase tracking-wide">
					Registro de publicador de la congregación
				</h2>

				<div className="mt-4 flex flex-wrap items-start justify-between gap-4">
					<dl className="flex flex-col gap-1">
						<div className="flex gap-1.5">
							<dt className="font-semibold">Nombre:</dt>
							<dd>{publisher.fullName}</dd>
						</div>
						<div className="flex gap-1.5">
							<dt className="font-semibold">Fecha de nacimiento:</dt>
							<dd>{publisher.birthDate ? formatShortDate(publisher.birthDate) : "—"}</dd>
						</div>
						<div className="flex gap-1.5">
							<dt className="font-semibold">Fecha de bautismo:</dt>
							<dd>{publisher.baptismDate ? formatShortDate(publisher.baptismDate) : "—"}</dd>
						</div>
					</dl>
					<div className="flex gap-4">
						<Checkbox label="Hombre" checked={publisher.gender === "male"} />
						<Checkbox label="Mujer" checked={publisher.gender === "female"} />
					</div>
				</div>

				<div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-gray-300 pt-3">
					{S21_APPOINTMENT_CHECKBOXES.map((a) => (
						<Checkbox key={a.type} label={a.label} checked={activeTypes.has(a.type)} />
					))}
				</div>

				<p className="mt-4 text-center font-semibold">
					Año de servicio: {serviceYear}–{serviceYear + 1}
				</p>

				{editing ? (
					<S21Editor
						key={serviceYear}
						userId={id}
						pioneerCapable={pioneerCapable}

						rows={monthRows.map(({ label, month, calendarYear, report }) => ({
							label,
							month,
							calendarYear,
							future: calendarYear * 12 + month > new Date().getFullYear() * 12 + new Date().getMonth() + 1,
							report: report && {
								participatedInMinistry: report.participatedInMinistry,
								isAuxiliaryPioneerThisMonth: report.isAuxiliaryPioneerThisMonth,
								hours: report.hours,
									projectHours: report.projectHours,
								bibleStudiesCount: report.bibleStudiesCount,
								comments: report.comments,
								creditHoursNote: report.creditHoursNote,
							},
						}))}
					/>
				) : (
					<table className="mt-2 w-full border-collapse border border-gray-800 text-center">
						<thead>
							<tr className="bg-gray-100">
								<th className="border border-gray-800 px-2 py-1.5 text-left">Mes</th>
								<th className="border border-gray-800 px-2 py-1.5">
									Participación
									<br />
									en el ministerio
								</th>
								<th className="border border-gray-800 px-2 py-1.5">
									Cursos
									<br />
									bíblicos
								</th>
								<th className="border border-gray-800 px-2 py-1.5">
									Precursor
									<br />
									auxiliar
								</th>
								<th className="border border-gray-800 px-2 py-1.5">Horas</th>
									{showProjectHours && (
										<th className="border border-gray-800 px-2 py-1.5">
											Horas de
											<br />
											proyectos
										</th>
									)}
								<th className="border border-gray-800 px-2 py-1.5 text-left">Notas</th>
							</tr>
						</thead>
						<tbody>
							{monthRows.map(({ label, report }) => (
								<tr key={label}>
									<td className="border border-gray-800 px-2 py-1.5 text-left">{label}</td>
									<td className="border border-gray-800 px-2 py-1.5">
										<Checkbox checked={report?.participatedInMinistry ?? false} />
									</td>
									<td className="border border-gray-800 px-2 py-1.5">{report?.bibleStudiesCount || ""}</td>
									<td className="border border-gray-800 px-2 py-1.5">
										<Checkbox checked={report?.isAuxiliaryPioneerThisMonth ?? false} />
									</td>
									<td className="border border-gray-800 px-2 py-1.5">{report?.hours || ""}</td>
										{showProjectHours && (
											<td className="border border-gray-800 px-2 py-1.5">{report?.projectHours || ""}</td>
										)}
									<td className="border border-gray-800 px-2 py-1.5 text-left">
										{[report?.creditHoursNote, report?.comments].filter(Boolean).join(" · ")}
									</td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr className="bg-gray-100 font-semibold">
								<td className="border border-gray-800 px-2 py-1.5 text-left" colSpan={4}>
									Total
								</td>
								<td className="border border-gray-800 px-2 py-1.5">{totalHours || ""}</td>
									{showProjectHours && (
										<td className="border border-gray-800 px-2 py-1.5">{totalProjectHours || ""}</td>
									)}
								<td className="border border-gray-800 px-2 py-1.5"></td>
							</tr>
						</tfoot>
					</table>
				)}
			</div>
			</div>
		</div>
	);
}

function Checkbox({ label, checked }: { label?: string; checked: boolean }) {
	return (
		<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
			<span className="flex h-3.5 w-3.5 items-center justify-center border border-gray-800 text-[10px] leading-none">
				{checked ? "✓" : ""}
			</span>
			{label}
		</span>
	);
}
