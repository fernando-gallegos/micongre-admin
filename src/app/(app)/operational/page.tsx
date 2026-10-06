import { redirect } from "next/navigation";
import { OperationalWeek } from "@/components/operational/OperationalWeek";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function OperationalPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.OPERATIONAL_ACCESS))) {
		redirect("/panel");
	}

	return <OperationalWeek />;
}
