import { redirect } from "next/navigation";
import { PreachingModule } from "@/components/preaching/PreachingModule";
import { getSession } from "@/lib/auth/session";
import { canAccessPreachingModule } from "@/lib/rbac/guards";

export default async function PreachingPage() {
	const session = await getSession();
	if (!canAccessPreachingModule(session)) redirect("/panel");
	return <PreachingModule />;
}
