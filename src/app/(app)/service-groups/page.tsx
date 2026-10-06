import { redirect } from "next/navigation";
import { ServiceGroupsList } from "@/components/serviceGroups/ServiceGroupsList";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function ServiceGroupsPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.SERVICE_GROUPS_ACCESS))) {
		redirect("/panel");
	}

	return <ServiceGroupsList />;
}
