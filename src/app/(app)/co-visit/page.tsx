import { redirect } from "next/navigation";
import { CoVisitHub } from "@/components/coVisit/CoVisitHub";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function CoVisitPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CO_VISIT_SCHEDULE_ACCESS))) {
		redirect("/panel");
	}

	return <CoVisitHub />;
}
