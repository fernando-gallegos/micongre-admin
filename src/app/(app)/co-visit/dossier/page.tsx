import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/Layout";
import { getDb } from "@/db/client";
import { RecommendationsDecisionPanel } from "@/components/coVisit/RecommendationsDecisionPanel";
import { getSession } from "@/lib/auth/session";
import { getCoVisitDossier } from "@/lib/queries/coVisitDossier";
import { APPOINTMENT_LABELS } from "@/lib/appointmentLabels";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

const MEETING_TYPE_LABELS: Record<string, string> = { midweek: "Entre semana", weekend: "Fin de semana" };

export default async function CoVisitDossierPage() {
	const session = await getSession();
	if (!session || (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.CO_VISIT_ACCESS))) {
		redirect("/panel");
	}

	const db = getDb();
	const dossier = await getCoVisitDossier(db);

	const attendanceRows = [...dossier.attendance]
		.sort((a, b) => (b.periodYear ?? 0) - (a.periodYear ?? 0) || (b.periodMonth ?? 0) - (a.periodMonth ?? 0))
		.slice(0, 24);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-5 print:max-w-none">
			<div className="print:hidden">
				<PageHeader title="Paquete S-61" subtitle="Visita del SC" />
			</div>

			<section className="border border-gray-800 bg-white p-5 text-sm print:border-black">
				<h2 className="text-base font-bold uppercase tracking-wide">
					Concentrado S-21 — Año de servicio {dossier.serviceYear}–{dossier.serviceYear + 1}
				</h2>

				<h3 className="mt-3 font-semibold">Precursores</h3>
				{dossier.pioneers.length === 0 ? (
					<p className="text-gray-500">Sin precursores activos.</p>
				) : (
					<table className="mt-1 w-full border-collapse border border-gray-800 text-left">
						<thead>
							<tr className="bg-gray-100">
								<th className="border border-gray-800 px-2 py-1">Nombre</th>
								<th className="border border-gray-800 px-2 py-1">Tipo</th>
								<th className="border border-gray-800 px-2 py-1 text-right">Horas (año de servicio)</th>
								<th className="border border-gray-800 px-2 py-1">Horas acreditadas (notas)</th>
							</tr>
						</thead>
						<tbody>
							{dossier.pioneers.map((p) => (
								<tr key={p.id}>
									<td className="border border-gray-800 px-2 py-1">{p.fullName}</td>
									<td className="border border-gray-800 px-2 py-1">{APPOINTMENT_LABELS[p.appointmentType] ?? p.appointmentType}</td>
									<td className="border border-gray-800 px-2 py-1 text-right">{p.totalHours}</td>
									<td className="border border-gray-800 px-2 py-1">{p.creditHoursNotes.join("; ") || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				<h3 className="mt-4 font-semibold">Publicadores activos por grupo de servicio</h3>
				{dossier.activeByGroup.map((g) => (
					<p key={g.groupId ?? "none"} className="mt-1">
						<span className="font-medium">{g.groupName}:</span> {g.members.length} —{" "}
						{g.members.map((m) => m.fullName).join(", ")}
					</p>
				))}

				<h3 className="mt-4 font-semibold">Publicadores inactivos (sfg 17:15)</h3>
				{dossier.inactivePublishers.length === 0 ? (
					<p className="text-gray-500">Ninguno.</p>
				) : (
					<p>{dossier.inactivePublishers.map((p) => p.fullName).join(", ")}</p>
				)}
			</section>

			<section className="border border-gray-800 bg-white p-5 text-sm print:border-black">
				<h2 className="text-base font-bold uppercase tracking-wide">Consolidado S-88 — Últimos 12 meses</h2>
				<table className="mt-2 w-full border-collapse border border-gray-800 text-left">
					<thead>
						<tr className="bg-gray-100">
							<th className="border border-gray-800 px-2 py-1">Período</th>
							<th className="border border-gray-800 px-2 py-1">Reunión</th>
							<th className="border border-gray-800 px-2 py-1 text-right">Presencial</th>
							<th className="border border-gray-800 px-2 py-1 text-right">Zoom</th>
						</tr>
					</thead>
					<tbody>
						{attendanceRows.map((r, i) => (
							<tr key={i}>
								<td className="border border-gray-800 px-2 py-1">
									{r.periodYear}-{String(r.periodMonth).padStart(2, "0")}
								</td>
								<td className="border border-gray-800 px-2 py-1">
									{r.meetingType ? (MEETING_TYPE_LABELS[r.meetingType] ?? r.meetingType) : "—"}
								</td>
								<td className="border border-gray-800 px-2 py-1 text-right">{r.totalInPerson ?? 0}</td>
								<td className="border border-gray-800 px-2 py-1 text-right">{r.totalZoom ?? 0}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<div className="print:hidden">
				<RecommendationsDecisionPanel />
			</div>
		</div>
	);
}
