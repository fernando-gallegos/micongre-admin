"use client";

import { ACCENTS, useTheme } from "@/lib/theme/ThemeProvider";

export function AccentPicker() {
	const { accent, setAccent } = useTheme();

	return (
		<div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
			{ACCENTS.map((entry) => (
				<button
					key={entry.key}
					type="button"
					onClick={() => setAccent(entry.key)}
					aria-label={`Color ${entry.label}`}
					className="h-5 w-5 shrink-0 rounded-full transition-opacity hover:opacity-70"
					style={{
						background: entry.swatch,
						outline: accent === entry.key ? "2px solid var(--ink)" : "2px solid transparent",
						outlineOffset: 2,
					}}
				/>
			))}
		</div>
	);
}
