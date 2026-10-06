import { redirect } from "next/navigation";
import { DisasterAssessmentsList } from "@/components/disasterPreparedness/DisasterAssessmentsList";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function DisasterPreparednessPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.DISASTER_ACCESS))) {
		redirect("/panel");
	}

	return <DisasterAssessmentsList />;
}
