import { PastoralDashboard } from "@/components/pastoral/PastoralDashboard";

// Sin gate de admin a propósito — cualquier anciano activo (privilegio
// pastoral_care_access, otorgado automáticamente por nombramiento) también
// entra. El filtro real vive en cada API de /api/pastoral/* y
// /api/assistance-requests (assertCanAccessPastoralDashboard).
export default function PastoralPage() {
	return <PastoralDashboard />;
}
