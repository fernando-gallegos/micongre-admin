import { redirect } from "next/navigation";
import { CleaningSchedule } from "@/components/cleaning/CleaningSchedule";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function CleaningSchedulePage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CLEANING_ADMIN))) {
		redirect("/panel");
	}

	return <CleaningSchedule />;
}
