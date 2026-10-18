"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/Layout";

type Tab = "service" | "groups" | "attendance";

const PATHS: Record<Tab, string> = { service: "/reports", groups: "/reports/groups", attendance: "/reports/attendance" };

/** Pestañas Tarjetas / Grupos / Asistencia de Informes: cada una es su propia ruta (Asistencia solo para quien registra asistencia). */
export function ReportsTabs({ active, showAttendance = true }: { active: Tab; showAttendance?: boolean }) {
	const router = useRouter();
	return (
		<Segmented<Tab>
			value={active}
			onChange={(tab) => {
				if (tab !== active) router.push(PATHS[tab]);
			}}
			label="Informes"
			options={[
				{ value: "service", label: "Tarjetas" },
				{ value: "groups", label: "Grupos" },
				...(showAttendance ? [{ value: "attendance" as Tab, label: "Asistencia" }] : []),
			]}
		/>
	);
}
