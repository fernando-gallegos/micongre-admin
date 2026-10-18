import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { S4CollectionTable } from "@/components/reports/S4CollectionTable";
import { PageHeader } from "@/components/ui/Layout";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function ReportsPage() {
	const session = await getSession();
	// El acceso a asistencia lo da el privilegio "Registro de asistencia" (todo
	// anciano lo tiene por defecto, y se le puede otorgar a un publicador).
	const canRecordAttendance =
		session?.role === "admin" || !!session?.privilegeCodes.includes(PRIVILEGE_CODES.MEETING_ATTENDANCE_RECORDER);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Informes" />
			<ReportsTabs active="service" showAttendance={canRecordAttendance} />
			<S4CollectionTable />
		</div>
	);
}
