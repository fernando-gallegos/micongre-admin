import { redirect } from "next/navigation";
import { AttendanceList } from "@/components/reports/AttendanceList";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function AttendancePage() {
	const session = await getSession();
	if (
		!session ||
		(session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.MEETING_ATTENDANCE_RECORDER))
	) {
		redirect("/reports");
	}

	return <AttendanceList />;
}
