import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { getSetupStatus } from "@/lib/setup/status";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
	const status = await getSetupStatus(getDb());
	// El asistente solo existe mientras la app está sin administrador; después
	// todo sigue el flujo normal ("/" lleva al panel o al login).
	if (!status.needsSetup) redirect("/");

	return <SetupWizard existingUserCount={status.userCount} />;
}
