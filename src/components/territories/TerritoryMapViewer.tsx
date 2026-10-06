"use client";

import { useEffect, useState } from "react";
import { TERRITORY_KIND_LABEL, type TerritoryKind, type TerritoryMapData } from "@/lib/territories/geo";
import { MapDialog, MapHeader } from "./MapDialog";
import { TerritoryMap } from "./TerritoryMap";
import { Spinner } from "@/components/ui/Spinner";

interface MapPayload {
	number: string;
	kind: TerritoryKind;
	name: string | null;
	notes: string | null;
	mapData: TerritoryMapData | null;
}

/** Pantalla de solo lectura con el mapa de un territorio, encuadrado a todo lo
 * dibujado. Lo usan el módulo y Mi Panel (el encargado). */
export function TerritoryMapViewer({ territoryId, onClose }: { territoryId: string; onClose: () => void }) {
	const [payload, setPayload] = useState<MapPayload | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/territories/${territoryId}/map`)
			.then(async (response) => {
				if (!response.ok) throw new Error(String(response.status));
				const body = (await response.json()) as MapPayload;
				if (!cancelled) setPayload(body);
			})
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
		};
	}, [territoryId]);

	const title = payload ? `Territorio ${payload.number}${payload.name ? ` · ${payload.name}` : ""}` : "Territorio";

	return (
		<MapDialog>
			{payload ? (
				<TerritoryMap
					kind={payload.kind}
					data={payload.mapData}
					title={title}
					subtitle={[TERRITORY_KIND_LABEL[payload.kind], payload.notes].filter(Boolean).join(" · ")}
					onClose={onClose}
				/>
			) : (
				<>
					<MapHeader title={title} onClose={onClose} />
					<div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-soft">
						{failed ? "No se pudo cargar el mapa de este territorio." : <Spinner size={40} />}
					</div>
				</>
			)}
		</MapDialog>
	);
}
