"use client";

import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";

/** Marco de los mapas: en móvil ocupa toda la pantalla (mapa a sangre); en
 * escritorio es un diálogo grande centrado. El contenido llena todo el marco
 * y pone encima su propio encabezado y barras flotantes (`MapHeader`). */
export function MapDialog({ children }: { children: React.ReactNode }) {
	return (
		<div className="fixed inset-0 z-50 bg-surface-alt md:flex md:items-center md:justify-center md:bg-black/40 md:p-4">
			<div className="relative h-full w-full overflow-hidden bg-surface-alt md:h-[92dvh] md:max-w-5xl md:rounded-[28px] md:shadow-xl">
				{children}
			</div>
		</div>
	);
}

/** Encabezado flotante: volver, título y subtítulo; `children` son las acciones de la derecha. */
export function MapHeader({
	title,
	subtitle,
	onClose,
	children,
}: {
	title: string;
	subtitle?: React.ReactNode;
	onClose: () => void;
	children?: React.ReactNode;
}) {
	return (
		<div className="absolute inset-x-3 top-3 z-20 flex h-14 items-center gap-1 rounded-full bg-surface/95 px-2 shadow-md">
			<IconButton label="Volver" icon={ArrowLeft} onClick={onClose} />
			<div className="min-w-0 flex-1 pl-1">
				<div className="truncate text-[15px] font-semibold leading-tight text-ink">{title}</div>
				{subtitle && <div className="truncate text-xs text-ink-soft">{subtitle}</div>}
			</div>
			{children}
		</div>
	);
}
