import { redirect } from "next/navigation";
import { CongregationSettingsForm } from "@/components/congregation/CongregationSettingsForm";
import { getSession } from "@/lib/auth/session";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export default async function CongregationPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CONGREGATION_ACCESS))) {
		redirect("/panel");
	}

	return <CongregationSettingsForm isAdmin={session.role === "admin"} />;
}
