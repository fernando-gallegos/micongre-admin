"use client";

import { ACCENTS, useTheme } from "@/lib/theme/ThemeProvider";
import { List } from "@/components/ui/Layout";

// Apariencia (perfil): modo oscuro y color. Antes estaban en la barra superior.
export function AppearanceCard() {
	const { theme, setTheme, accent, setAccent } = useTheme();
	const dark = theme === "dark";

	return (
		<List>
			<div className="flex min-h-14 items-center gap-3 px-4">
				<span className="flex-1 text-base text-ink">Modo oscuro</span>
				<button
					type="button"
					role="switch"
					aria-checked={dark}
					aria-label="Modo oscuro"
					onClick={() => setTheme(dark ? "light" : "dark")}
					className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${dark ? "bg-accent" : "bg-border"}`}
				>
					<span
						className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all ${dark ? "left-[23px]" : "left-[3px]"}`}
					/>
				</button>
			</div>
			<div className="flex min-h-14 items-center gap-3 px-4 py-3">
				<span className="flex-1 text-base text-ink">Color</span>
				<div className="flex flex-wrap justify-end gap-3">
					{ACCENTS.map((entry) => (
						<button
							key={entry.key}
							type="button"
							onClick={() => setAccent(entry.key)}
							aria-label={`Color ${entry.label}`}
							aria-pressed={accent === entry.key}
							className="h-8 w-8 shrink-0 rounded-full"
							style={{
								background: entry.swatch,
								outline: accent === entry.key ? "2px solid var(--ink)" : "2px solid transparent",
								outlineOffset: 3,
							}}
						/>
					))}
				</div>
			</div>
		</List>
	);
}
