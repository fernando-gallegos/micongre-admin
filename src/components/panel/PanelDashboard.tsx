"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Layout";
import type { PanelAssignment } from "@/lib/queries/panel";
import { AssignedPastoralVisits } from "./AssignedPastoralVisits";
import { MyAssignments } from "./MyAssignments";
import { MyGroup } from "./MyGroup";
import { MyNotifications } from "./MyNotifications";
import { MyServiceReports } from "./MyServiceReports";
import { PanelActions } from "./PanelActions";
import { RegularPioneerCard } from "./RegularPioneerCard";
import { RequestPastoralVisit } from "./RequestPastoralVisit";
import { PageLoader } from "@/components/ui/Spinner";
import { PanelLinks, type PanelLink } from "./PanelLinks";

interface Group {
	name: string;
	color?: string | null;
	overseerName: string | null;
	assistantName: string | null;
	members: { id: string; fullName: string; activeAppointmentTypes: string[] }[];
}

const now = new Date();

export function PanelDashboard({ userId, fullName }: { userId: string; fullName: string }) {
	const [upcoming, setUpcoming] = useState<PanelAssignment[]>([]);
	const [history, setHistory] = useState<PanelAssignment[]>([]);
	const [group, setGroup] = useState<Group | null>(null);
	const [links, setLinks] = useState<PanelLink[]>([]);
	const [loading, setLoading] = useState(true);
	const [requestFormOpen, setRequestFormOpen] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		const summaryRes = await fetch("/api/panel/summary");
		if (summaryRes.ok) {
			const body = (await summaryRes.json()) as { upcoming: PanelAssignment[]; history: PanelAssignment[]; group: Group | null; links?: PanelLink[] };
			setUpcoming(body.upcoming);
			setHistory(body.history);
			setGroup(body.group);
			setLinks(body.links ?? []);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const firstName = fullName.trim().split(/s+/)[0] ?? "";
	const todayLabel = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

	if (loading) return <PageLoader />;

	// En móvil todo va en una columna (asignaciones, avisos, atajos y lo demás); desde lg las
	// dos columnas son wrappers reales y `order` solo acomoda el orden de lectura móvil.
	// `empty:hidden` evita huecos cuando una tarjeta no se muestra.
	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4 lg:items-end">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/logo.svg" alt="Mi Congre" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[12px] lg:hidden" />
				<div className="min-w-0 flex-1 lg:flex-none">
					<p className="text-[13px] text-ink-soft lg:text-sm">{todayLabel}</p>
					<h1 className="mt-0.5 font-display text-[30px] font-medium leading-tight text-ink lg:text-[40px] lg:leading-[1.1]">
						Hola, {firstName}
					</h1>
				</div>
				<div className="hidden lg:block">
					<PanelActions userId={userId} onRequestPastoralVisit={() => setRequestFormOpen(true)} />
				</div>
				<Link href="/profile" aria-label="Mi perfil" className="shrink-0 lg:hidden">
					<Avatar name={fullName} size={44} />
				</Link>
			</div>

			<div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
				<div className="contents lg:col-span-3 lg:min-w-0 lg:flex lg:flex-col lg:gap-6">
					<div className="order-1 empty:hidden">
						<MyAssignments title="Mis asignaciones" items={upcoming} emptyLabel="No tienes asignaciones próximas." onChange={load} />
					</div>
					<div className="order-3 lg:hidden">
						<PanelActions userId={userId} onRequestPastoralVisit={() => setRequestFormOpen(true)} />
					</div>
					<div className="order-4 empty:hidden">
						<MyServiceReports userId={userId} fullName={fullName} />
					</div>
					<div className="order-6 empty:hidden">
						<RequestPastoralVisit onChange={load} formOpen={requestFormOpen} onFormOpenChange={setRequestFormOpen} />
					</div>
					<div className="order-7 empty:hidden">
						<AssignedPastoralVisits onChange={load} />
					</div>
					{history.length > 0 && (
						<div className="order-9">
							<MyAssignments title="Mi historial" items={history} emptyLabel="Todavía no tienes historial." />
						</div>
					)}
				</div>

				<div className="contents lg:col-span-2 lg:min-w-0 lg:flex lg:flex-col lg:gap-6">
					<div className="order-2 empty:hidden">
						<MyNotifications />
					</div>
					<div className="order-5 empty:hidden">
						<RegularPioneerCard />
					</div>
					{group && (
						<div className="order-8">
							<MyGroup group={group} />
						</div>
					)}
				</div>
			</div>
			<PanelLinks links={links} />
		</div>
	);
}
