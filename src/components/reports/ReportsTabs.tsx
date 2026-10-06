"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/Layout";

type Tab = "service" | "attendance";

/** Pestañas Servicio / Asistencia de Informes: cada una es su propia ruta. */
export function ReportsTabs({ active }: { active: Tab }) {
	const router = useRouter();
	return (
		<Segmented<Tab>
			value={active}
			onChange={(tab) => {
				if (tab !== active) router.push(tab === "service" ? "/reports" : "/reports/attendance");
			}}
			label="Informes"
			options={[
				{ value: "service", label: "Servicio" },
				{ value: "attendance", label: "Asistencia" },
			]}
		/>
	);
}
