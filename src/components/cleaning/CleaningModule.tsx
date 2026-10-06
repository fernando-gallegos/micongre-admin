"use client";

import { useState } from "react";
import { BookOpen, CalendarRange } from "lucide-react";
import { Chip, ChipGroup, IconButton, PageHeader } from "@/components/ui/Layout";
import { CLEANING_KIND_LABEL, type CleaningKind } from "@/lib/cleaning/labels";
import { CleaningGuideModal } from "./CleaningGuideModal";
import { CleaningTable } from "./CleaningTable";
import { HallCongregationsCard } from "./HallCongregationsCard";

type Tab = CleaningKind | "congregaciones";

const TABS: { id: Tab; label: string }[] = [
	{ id: "ligera", label: CLEANING_KIND_LABEL.ligera },
	{ id: "profunda", label: CLEANING_KIND_LABEL.profunda },
	{ id: "a_fondo", label: CLEANING_KIND_LABEL.a_fondo },
	{ id: "congregaciones", label: "Congregaciones del salón" },
];

export function CleaningModule() {
	const [tab, setTab] = useState<Tab>("ligera");
	const [guideOpen, setGuideOpen] = useState(false);
	// Cambia al agregar/desactivar una congregación del salón para que las
	// tablas (ya montadas) vuelvan a pedir sus opciones.
	const [catalogVersion, setCatalogVersion] = useState(0);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Limpieza del salón"
				subtitle="Asigna a los grupos de servicio u otras congregaciones del salón y marca lo realizado."
				actions={
					<>
						{tab !== "congregaciones" && <IconButton label="Ver guía" icon={BookOpen} onClick={() => setGuideOpen(true)} />}
						<IconButton label="Generar cronograma" icon={CalendarRange} href="/cleaning/schedule" />
					</>
				}
			/>

			<ChipGroup>
				{TABS.map((t) => (
					<Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
						{t.label}
					</Chip>
				))}
			</ChipGroup>

			{tab === "congregaciones" ? (
				<HallCongregationsCard onChanged={() => setCatalogVersion((v) => v + 1)} />
			) : (
				<>
					<CleaningTable key={`${tab}:${catalogVersion}`} kind={tab} />
					<CleaningGuideModal kind={tab} open={guideOpen} onClose={() => setGuideOpen(false)} />
				</>
			)}
		</div>
	);
}
