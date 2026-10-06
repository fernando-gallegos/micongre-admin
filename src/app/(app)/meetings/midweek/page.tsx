import { redirect } from "next/navigation";
import { MidweekList } from "@/components/meetings/midweek/MidweekList";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function MidweekMeetingsPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.MIDWEEK_ACCESS))) {
		redirect("/panel");
	}

	return <MidweekList />;
}
