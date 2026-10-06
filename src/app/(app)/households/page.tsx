import { redirect } from "next/navigation";
import { HouseholdsList } from "@/components/households/HouseholdsList";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function HouseholdsPage() {
	const session = await getSession();
	const canAccess =
		session &&
		(session.role === "admin" ||
			session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_ALL) ||
			session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_GROUP));
	if (!canAccess) redirect("/panel");

	return <HouseholdsList />;
}
