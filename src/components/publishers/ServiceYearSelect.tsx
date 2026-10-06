"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ServiceYearSelect({ years, selected }: { years: number[]; selected: number }) {
	const router = useRouter();
	const searchParams = useSearchParams();

	function changeYear(year: string) {
		// Conserva el resto de parámetros (p. ej. el modo edición).
		const params = new URLSearchParams(searchParams.toString());
		params.set("serviceYear", year);
		router.push(`?${params.toString()}`);
	}

	return (
		<label className="flex items-center gap-2 text-sm print:hidden">
			<span className="font-medium text-ink-soft">Año de servicio</span>
			<select
				value={selected}
				onChange={(e) => changeYear(e.target.value)}
				className="min-h-11 rounded-full border border-border bg-surface px-4 text-base font-medium text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
			>
				{years.map((year) => (
					<option key={year} value={year}>
						{year}–{year + 1}
					</option>
				))}
			</select>
		</label>
	);
}
