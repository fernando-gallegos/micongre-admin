"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatWeekRangeEs, mondayOf, toISODate } from "@/lib/mwb/dates";
import { confirmDiscardChanges } from "@/lib/useUnsavedChanges";

/** Semana elegida de una pantalla, recordada en el navegador: al volver a abrir la pantalla carga en esa misma semana.
 * `key` distingue la pantalla (cada una recuerda la suya). */
export function useStoredWeek(key: string): [string, (weekStart: string) => void] {
	const storageKey = `mc.week.${key}`;
	const [weekStart, setWeek] = useState(() => toISODate(mondayOf(new Date())));

	// Se lee después de montar (no en el render inicial) para que el servidor y el cliente pinten lo mismo. Si no hay nada guardado, se queda
	// con la semana actual. También se vuelve a leer al volver a la pestaña/ventana y cuando otra pestaña del navegador cambia la semana.
	useEffect(() => {
		const read = () => {
			try {
				const saved = window.localStorage.getItem(storageKey);
				if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setWeek(toISODate(mondayOf(new Date(`${saved}T00:00:00Z`))));
			} catch {
				// sin almacenamiento disponible: se queda con la semana actual
			}
		};
		read();
		const onStorage = (e: StorageEvent) => {
			if (e.key === storageKey) read();
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") read();
		};
		window.addEventListener("storage", onStorage);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.removeEventListener("storage", onStorage);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [storageKey]);

	const set = useCallback(
		(value: string) => {
			setWeek(value);
			try {
				window.localStorage.setItem(storageKey, value);
			} catch {
				// ignorar
			}
		},
		[storageKey],
	);
	return [weekStart, set];
}

/** Selector de semana (lunes ISO) compartido por las pantallas semanales.
 * En pantallas estrechas ocupa el 100% del ancho (el rango se estira entre
 * las flechas); desde `sm` mide lo que necesita. */
export function WeekNav({ weekStart, onChange: change }: { weekStart: string; onChange: (weekStart: string) => void }) {
	// Cambiar de semana descarta lo que no se haya guardado: se pregunta antes.
	const onChange = (value: string) => {
		if (value !== weekStart && !confirmDiscardChanges()) return;
		change(value);
	};
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
