"use client";

import { useEffect, useState } from "react";
import { Chip, ChipGroup } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { WhatsAppGlyph } from "@/components/panel/PanelLinks";

type Kind = "weekday" | "weekend";
type Week = "current" | "next";

interface Result {
	text: string | null;
	url: string | null;
	label: string;
}

const TITLE: Record<Kind, string> = { weekday: "Entre semana", weekend: "Fin de semana" };

/**
 * Botones «Entre semana» y «Fin de semana» del encabezado de Predicación: arman el mensaje para el grupo de WhatsApp de la
 * congregación (`GET /api/preaching/whatsapp`), lo muestran y lo abren en WhatsApp con el texto ya escrito (api.whatsapp.com/send?text=…; wa.me pierde los emojis al redirigir), donde
 * se elige el grupo. WhatsApp no deja escoger un grupo desde un enlace.
 */
export function WhatsAppPreachingButtons() {
	const [kind, setKind] = useState<Kind | null>(null);
	return (
		<>
			{(["weekday", "weekend"] as Kind[]).map((k) => (
				<Button key={k} variant="secondary" onClick={() => setKind(k)} title={`Mensaje de WhatsApp con la predicación ${k === "weekday" ? "de entre semana" : "del fin de semana"}`}>
					<WhatsAppGlyph size={18} />
					{TITLE[k]}
				</Button>
			))}
			{kind && <WhatsAppDialog kind={kind} onClose={() => setKind(null)} />}
		</>
	);
}

function WhatsAppDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
	const [week, setWeek] = useState<Week>("current");
	const [result, setResult] = useState<Result | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let alive = true;
		setResult(null);
		setError(false);
		fetch(`/api/preaching/whatsapp?kind=${kind}&week=${week}`)
			.then((r) => (r.ok ? (r.json() as Promise<Result>) : Promise.reject(new Error("http"))))
			.then((j: Result) => alive && setResult(j))
			.catch(() => alive && setError(true));
		return () => {
			alive = false;
		};
	}, [kind, week]);

	return (
		<Modal open onClose={onClose} title={`WhatsApp · ${TITLE[kind]}`}>
			<div className="flex flex-col gap-4">
				<ChipGroup>
					<Chip active={week === "current"} onClick={() => setWeek("current")}>
						Esta semana
					</Chip>
					<Chip active={week === "next"} onClick={() => setWeek("next")}>
						La próxima
					</Chip>
				</ChipGroup>
				{error && <p className="text-sm text-red-600">No se pudo armar el mensaje.</p>}
				{!error && !result && <p className="text-sm text-ink-soft">Armando el mensaje…</p>}
				{result && !result.text && <p className="text-sm text-ink-soft">No hay predicación programada del {result.label}.</p>}
				{result?.text && (
					<>
						<pre className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-surface-alt p-4 font-sans text-sm leading-relaxed text-ink">
							{result.text}
						</pre>
						<a
							href={result.url ?? "#"}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => setTimeout(onClose, 300)}
							className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-white hover:brightness-95"
						>
							<WhatsAppGlyph size={18} />
							Abrir en WhatsApp
						</a>
						<p className="text-xs text-ink-soft">En WhatsApp, elige el grupo de la congregación y envía.</p>
					</>
				)}
			</div>
		</Modal>
	);
}
