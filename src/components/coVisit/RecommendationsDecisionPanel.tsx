"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/Layout";

const OFFICE_LABELS: Record<string, string> = { ELDER: "Anciano", MINISTERIAL_SERVANT: "Siervo ministerial" };
const DECISION_LABELS: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobado", NOT_APPOINTED: "No nombrado" };

interface Recommendation {
	id: string;
	visitId: string | null;
	candidateUserId: string;
	recommendedOffice: string;
	isFirstTime: boolean;
	isReappointment: boolean;
	previousCongregationLetterAttached: boolean;
	threeMandatoryQuestionsConfirmed: boolean;
	circuitOverseerDecision: string;
	announcementDate: string | null;
}

interface PublisherOption {
	id: string;
	fullName: string;
}

// Reutilizado en /co-visit (hub del admin) y /co-visit/dossier (vista del
// SC) — es la única escritura que el SC puede hacer en todo el módulo
// (PATCH .../decision), así que este componente vive fuera del hub
// admin-only para poder mostrarse en ambos lugares.
export function RecommendationsDecisionPanel({ visitId }: { visitId?: string }) {
	const [items, setItems] = useState<Recommendation[]>([]);
	const [publishers, setPublishers] = useState<PublisherOption[]>([]);
	const [saving, setSaving] = useState<string | null>(null);
	const [forbidden, setForbidden] = useState(false);

	const load = useCallback(async () => {
		const [recRes, pubRes] = await Promise.all([fetch("/api/co-recommendations"), fetch("/api/publishers")]);
		if (recRes.status === 403) {
			setForbidden(true);
			return;
		}
		setForbidden(false);
		if (recRes.ok) setItems(((await recRes.json()) as { items: Recommendation[] }).items);
		if (pubRes.ok) setPublishers(((await pubRes.json()) as { items: PublisherOption[] }).items);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const candidateName = (userId: string) => publishers.find((p) => p.id === userId)?.fullName ?? "—";

	async function updateDecision(id: string, decision: string, announcementDate: string | null) {
		setSaving(id);
		await fetch(`/api/co-recommendations/${id}/decision`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ circuitOverseerDecision: decision, announcementDate: announcementDate || null }),
		});
		setSaving(null);
		load();
	}

	if (forbidden) return null;

	const filtered = visitId ? items.filter((r) => r.visitId === visitId) : items;

	return (
		<section>
			<SectionLabel>Recomendaciones S-62</SectionLabel>
			{filtered.length === 0 ? (
				<Card>
					<p className="text-sm text-ink-soft">Todavía no hay recomendaciones registradas.</p>
				</Card>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-[20px] bg-surface text-sm">
					{filtered.map((r) => (
						<li key={r.id} className="px-4 py-3">
							<div className="mb-1 flex items-start justify-between gap-2">
								<span className="text-base font-semibold text-ink">
									{candidateName(r.candidateUserId)} — {OFFICE_LABELS[r.recommendedOffice] ?? r.recommendedOffice}
								</span>
								<Badge
									tone={
										r.circuitOverseerDecision === "APPROVED"
											? "success"
											: r.circuitOverseerDecision === "NOT_APPOINTED"
												? "danger"
												: "warning"
									}
								>
									{DECISION_LABELS[r.circuitOverseerDecision]}
								</Badge>
							</div>
							<p className="text-[13px] text-ink-soft">
								{r.isFirstTime ? "Primera vez" : r.isReappointment ? "Renombramiento" : "—"} ·{" "}
								{r.previousCongregationLetterAttached ? "Con carta de congregación anterior" : "Sin carta previa"} ·{" "}
								{r.threeMandatoryQuestionsConfirmed ? "3 preguntas confirmadas" : "Preguntas pendientes"}
							</p>
							<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
								<Select
									label="Decisión del SC"
									value={r.circuitOverseerDecision}
									onChange={(e) => updateDecision(r.id, e.target.value, r.announcementDate)}
								>
									{Object.entries(DECISION_LABELS).map(([code, label]) => (
										<option key={code} value={code}>
											{label}
										</option>
									))}
								</Select>
								<Input
									label="Fecha de anuncio"
									type="date"
									value={r.announcementDate ?? ""}
									onChange={(e) => updateDecision(r.id, r.circuitOverseerDecision, e.target.value)}
								/>
							</div>
							{saving === r.id && <p className="mt-1 text-xs text-ink-soft">Guardando...</p>}
						</li>
					))}
				</ul>
			)}
			<Button variant="secondary" onClick={load} className="mt-3">
				Actualizar
			</Button>
		</section>
	);
}
