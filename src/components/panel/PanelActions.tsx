"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";

const LINK_CLASS =
	"inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-transparent px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt";

// Atajos de Mi panel como píldoras de acción: lo que se hace seguido.
export function PanelActions({ userId, onRequestPastoralVisit }: { userId: string; onRequestPastoralVisit: () => void }) {
	return (
		<div className="flex flex-wrap items-center gap-2.5">
			<a href="#mi-informe" className={LINK_CLASS}>
				Mi informe del mes
			</a>
			<Button variant="secondary" onClick={onRequestPastoralVisit} title="Solicitar visita de pastoreo">
				Solicitar visita
			</Button>
			<Tooltip content="Tarjeta de publicador (S-21)">
				<Link href={`/publishers/${userId}/s21`} className={LINK_CLASS}>
					Mi S-21
				</Link>
			</Tooltip>
		</div>
	);
}
