"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/Layout";
import { getCurrentServiceYear } from "@/lib/serviceYear";

const GOAL_HOURS = 600;
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

// Semicírculo tipo velocímetro, a mano en SVG (sin librería de gráficos) —
// centro (100,100), radio 80, abre por abajo. ángulo 180°=izquierda (0%),
// 360°=derecha (100%), pasando por 270°=arriba, con el sentido de barrido de
// SVG en pantalla (y crece hacia abajo) para que el barrido sea horario.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
	const start = polarPoint(cx, cy, r, startAngle);
	const end = polarPoint(cx, cy, r, endAngle);
	const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function HoursGauge({ hours }: { hours: number }) {
	const cx = 100;
	const cy = 100;
	const r = 80;
	const fraction = Math.min(hours / GOAL_HOURS, 1);
	const progressAngle = 180 + fraction * 180;

	return (
		<svg viewBox="-20 -20 240 140" className="w-full max-w-[280px]">
			<path d={arcPath(cx, cy, r, 180, 360)} fill="none" stroke="var(--line)" strokeWidth={14} strokeLinecap="round" />
			{fraction > 0 && (
				<path
					d={arcPath(cx, cy, r, 180, progressAngle)}
					fill="none"
					stroke="var(--accent)"
					strokeWidth={14}
					strokeLinecap="round"
				/>
			)}
			{TICKS.map((t) => {
				const angle = 180 + t * 180;
				const outer = polarPoint(cx, cy, r + 9, angle);
				const inner = polarPoint(cx, cy, r - 9, angle);
				const label = polarPoint(cx, cy, r + 22, angle);
				return (
					<g key={t}>
						<line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--ink-soft)" strokeWidth={2} />
						<text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-ink-soft text-[9px]">
							{Math.round(t * GOAL_HOURS)}
						</text>
					</g>
				);
			})}
			<text x={cx} y={cy - 6} textAnchor="middle" className="fill-ink text-2xl font-semibold">
				{Math.round(hours)}
			</text>
			<text x={cx} y={cy + 14} textAnchor="middle" className="fill-ink-soft text-[11px]">
				de {GOAL_HOURS} horas
			</text>
		</svg>
	);
}

function daysUntilServiceYearEnd(): number {
	const serviceYear = getCurrentServiceYear();
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	// El año de servicio termina el último día de agosto (agosto = mes 7, 0-indexado).
	const end = new Date(serviceYear + 1, 7, 31);
	return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
}

export function RegularPioneerCard() {
	const [visible, setVisible] = useState(false);
	const [hours, setHours] = useState(0);
	const [serviceYear, setServiceYear] = useState<number | null>(null);

	useEffect(() => {
		async function load() {
			const response = await fetch("/api/reports/s4/service-year");
			if (!response.ok) return;
			const body = (await response.json()) as { isRegularPioneer: boolean; serviceYear: number; hours: number };
			if (!body.isRegularPioneer) return;
			setVisible(true);
			setHours(body.hours);
			setServiceYear(body.serviceYear);
		}
		load();
	}, []);

	if (!visible || serviceYear === null) return null;

	return (
		<section>
			<SectionLabel>
				Año de servicio {serviceYear}-{serviceYear + 1}
			</SectionLabel>
			<Card>
				<p className="mb-3 text-sm text-ink-soft">
					Quedan <span className="font-semibold text-ink">{daysUntilServiceYearEnd()}</span> días para que termine.
				</p>
				<div className="flex justify-center">
					<HoursGauge hours={hours} />
				</div>
			</Card>
		</section>
	);
}
