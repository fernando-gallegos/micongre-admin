"use client";

import { Segmented } from "@/components/ui/Layout";

export type WeekendTab = "planner" | "speakers" | "history" | "message";

const TABS: { value: WeekendTab; label: string }[] = [
	{ value: "planner", label: "Planificador" },
	{ value: "speakers", label: "Oradores" },
	{ value: "history", label: "Historial" },
	{ value: "message", label: "Mensaje" },
];

export function WeekendTabs({ active, onChange }: { active: WeekendTab; onChange: (tab: WeekendTab) => void }) {
	return <Segmented value={active} onChange={onChange} options={TABS} label="Fin de semana" />;
}
