import { redirect } from "next/navigation";
import { MoreMenu } from "@/components/layout/MoreMenu";
import { getSession } from "@/lib/auth/session";

export default async function MorePage() {
	const session = await getSession();
	if (!session) redirect("/login");

	return <MoreMenu role={session.role} privilegeCodes={session.privilegeCodes} fullName={session.fullName} />;
}
