"use client";

import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TERRITORY_KIND_LABEL, type TerritoryKind, type TerritoryMapData } from "@/lib/territories/geo";
import { MapDialog, MapHeader } from "./MapDialog";
import { TerritoryMap } from "./TerritoryMap";
import { Spinner } from "@/components/ui/Spinner";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

interface Detail {
	number: string;
	kind: TerritoryKind;
	name: string | null;
	mapData: TerritoryMapData | null;
}

/** Modal para dibujar el mapa de un territorio y guardarlo. */
export function TerritoryMapEditor({
	territoryId,
	searchHint,
	onClose,
	onSaved,
}: {
	territoryId: string;
	/** Dirección (p. ej. la del Salón del Reino) para centrar un mapa vacío. */
	searchHint: string | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [detail, setDetail] = useState<Detail | null>(null);
	const [failed, setFailed] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const latest = useRef<TerritoryMapData | null>(null);
	useUnsavedChanges(dirty);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/territories/${territoryId}`)
			.then(async (response) => {
				if (!response.ok) throw new Error(String(response.status));
				const body = (await response.json()) as Detail;
				if (!cancelled) setDetail(body);
			})
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
		};
	}, [territoryId]);

	function close() {
		if (dirty && !window.confirm("Hay cambios sin guardar en el mapa. ¿Cerrar sin guardar?")) return;
		onClose();
	}

	async function save() {
		if (!latest.current) return;
		setSaving(true);
		setError(null);
		const mapData = latest.current.features.length > 0 ? latest.current : null;
		const response = await fetch(`/api/territories/${territoryId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ mapData }),
		});
		setSaving(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			setError(
				body?.error === "map_not_allowed"
					? "Este tipo de territorio solo admite puntos y textos."
					: "No se pudo guardar el mapa. Si dibujaste muchísimo, simplifica un poco e intenta de nuevo.",
			);
			return;
		}
		setDirty(false);
		onSaved();
		onClose();
	}

	const title = detail ? `Territorio ${detail.number}${detail.name ? ` · ${detail.name}` : ""}` : "Mapa del territorio";

	return (
		<MapDialog>
			{detail ? (
				<TerritoryMap
					kind={detail.kind}
					data={detail.mapData}
					editable
					searchHint={searchHint}
					title={title}
					subtitle={TERRITORY_KIND_LABEL[detail.kind]}
					onClose={close}
					footer={
						<>
							{error && <p className="rounded-2xl bg-surface/95 px-3 py-2 text-center text-xs text-warn shadow-md">{error}</p>}
							<Button onClick={save} disabled={saving || !dirty} className="min-h-[52px] w-full text-base shadow-lg">
								<Save size={18} />
								{saving ? "Guardando..." : "Guardar mapa"}
							</Button>
						</>
					}
					onChange={(next) => {
						latest.current = next;
						setDirty(true);
					}}
				/>
			) : (
				<>
					<MapHeader title={title} onClose={close} />
					<div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-soft">
						{failed ? "No se pudo cargar el territorio." : <Spinner size={40} />}
					</div>
				</>
			)}
		</MapDialog>
	);
}
