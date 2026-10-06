import { redirect } from "next/navigation";
import { CleaningModule } from "@/components/cleaning/CleaningModule";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function CleaningPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CLEANING_ADMIN))) {
		redirect("/panel");
	}

	return <CleaningModule />;
}
