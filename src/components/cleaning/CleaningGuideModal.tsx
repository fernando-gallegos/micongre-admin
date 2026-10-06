"use client";

import { Modal } from "@/components/ui/Modal";
import { CLEANING_GUIDES, CLEANING_KIND_FREQUENCY, CLEANING_KIND_LABEL, type CleaningKind } from "@/lib/cleaning/labels";

// Resumen de la Guía para la limpieza del Salón del Reino del tipo de limpieza
// que se está viendo: frecuencia, equipo, recordatorios y áreas.
export function CleaningGuideModal({ kind, open, onClose }: { kind: CleaningKind; open: boolean; onClose: () => void }) {
	const guide = CLEANING_GUIDES[kind];
	return (
		<Modal open={open} onClose={onClose} title={`Guía: ${CLEANING_KIND_LABEL[kind]}`}>
			<div className="flex flex-col gap-5 text-sm text-ink">
				<p className="font-medium">{CLEANING_KIND_FREQUENCY[kind]}</p>

				<section>
					<h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Equipo y suministros requeridos</h3>
					<ul className="list-disc pl-5">
						{guide.equipment.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</section>

				<section>
					<h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-ink-soft">Recordatorios</h3>
					<ul className="list-disc pl-5">
						{guide.reminders.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					{guide.areas.map((area, i) => (
						<div key={area.title}>
							<h3 className="font-semibold">
								{i + 1}. {area.title}
							</h3>
							<ul className="list-disc pl-5">
								{area.items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</div>
					))}
				</section>

				<p className="text-xs text-ink-soft">Resumen de las Guías para la limpieza del Salón del Reino; consulta la guía completa.</p>
			</div>
		</Modal>
	);
}
