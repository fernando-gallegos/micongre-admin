import { redirect } from "next/navigation";
import { WeekendModule } from "@/components/meetings/weekend/WeekendModule";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function WeekendMeetingsPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.WEEKEND_ACCESS))) {
		redirect("/panel");
	}

	return <WeekendModule />;
}
