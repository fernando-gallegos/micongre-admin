"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/Layout";

export interface PublisherTab {
	value: string;
	label: string;
	content: React.ReactNode;
}

// Pestañas de la ficha (Datos / Nomb. / Priv. / Acceso). Cada pestaña llega ya
// renderizada desde el servidor; aquí solo se elige cuál mostrar.
export function PublisherTabs({ tabs }: { tabs: PublisherTab[] }) {
	const [active, setActive] = useState(tabs[0]?.value ?? "");
	const current = tabs.find((t) => t.value === active) ?? tabs[0];

	return (
		<div className="flex flex-col gap-5">
			{tabs.length > 1 && (
				<Segmented
					label="Secciones de la ficha"
					value={current?.value ?? ""}
					onChange={setActive}
					options={tabs.map((t) => ({ value: t.value, label: t.label }))}
				/>
			)}
			{current?.content}
		</div>
	);
}
