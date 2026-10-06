"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatWeekRangeEs, mondayOf, toISODate } from "@/lib/mwb/dates";

/** Selector de semana (lunes ISO) compartido por las pantallas semanales.
 * En pantallas estrechas ocupa el 100% del ancho (el rango se estira entre
 * las flechas); desde `sm` mide lo que necesita. */
export function WeekNav({ weekStart, onChange }: { weekStart: string; onChange: (weekStart: string) => void }) {
	const shift = (days: number) => onChange(toISODate(addDays(new Date(`${weekStart}T00:00:00Z`), days)));

	return (
		<div className="flex w-full items-center gap-2 rounded-full bg-surface p-1 sm:w-auto">
			<div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
				<button
					type="button"
					onClick={() => shift(-7)}
					aria-label="Semana anterior"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt"
				>
					<ChevronLeft size={20} />
				</button>
				<p className="min-w-0 flex-1 whitespace-nowrap px-1 text-center text-sm sm:text-[15px] font-semibold text-ink sm:min-w-[14rem] sm:flex-none">
					{formatWeekRangeEs(weekStart)}
				</p>
				<button
					type="button"
					onClick={() => shift(7)}
					aria-label="Semana siguiente"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-alt"
				>
					<ChevronRight size={20} />
				</button>
			</div>
			<button
				type="button"
				onClick={() => onChange(toISODate(mondayOf(new Date())))}
				className="min-h-11 shrink-0 rounded-full border border-border px-3 text-sm font-medium text-ink hover:bg-surface-alt"
			>
				Hoy
			</button>
		</div>
	);
}
