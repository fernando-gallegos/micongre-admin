import { ReportsTabs } from "@/components/reports/ReportsTabs";
import { GroupReportsTable } from "@/components/reports/GroupReportsTable";
import { PageHeader } from "@/components/ui/Layout";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function GroupReportsPage() {
	const session = await getSession();
	const canRecordAttendance =
		session?.role === "admin" || !!session?.privilegeCodes.includes(PRIVILEGE_CODES.MEETING_ATTENDANCE_RECORDER);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Informes" />
			<ReportsTabs active="groups" showAttendance={canRecordAttendance} />
			<GroupReportsTable />
		</div>
	);
}
