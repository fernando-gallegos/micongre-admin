import { redirect } from "next/navigation";
import { PanelDashboard } from "@/components/panel/PanelDashboard";
import { getSession } from "@/lib/auth/session";

export default async function PanelPage() {
	const session = await getSession();
	if (!session) redirect("/login");

	return <PanelDashboard userId={session.userId} fullName={session.fullName} />;
}
