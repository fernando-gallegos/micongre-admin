import { redirect } from "next/navigation";
import { BulkAssign } from "@/components/publishers/BulkAssign";
import { BackIconButton } from "@/components/publishers/HeaderIcons";
import { PageHeader } from "@/components/ui/Layout";
import { getDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { canAdministerAccounts, canManageAppointments } from "@/lib/rbac/guards";

// Asignación masiva de privilegios y nombramientos: se entra si se puede hacer al menos una de las dos cosas de uno en uno.
export default async function BulkAssignPage() {
	const session = await getSession();
	if (!session) redirect("/login");
	if (!canAdministerAccounts(session) && !(await canManageAppointments(getDb(), session))) redirect("/panel");

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Asignación masiva"
				subtitle="Agrega o quita privilegios y nombramientos a varias personas a la vez"
				actions={<BackIconButton href="/publishers" label="Volver a Personas" />}
			/>
			<BulkAssign />
		</div>
	);
}
