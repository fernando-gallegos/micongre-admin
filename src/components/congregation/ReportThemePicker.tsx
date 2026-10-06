"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { DEFAULT_REPORT_THEME, REPORT_THEME_IDS, REPORT_THEMES, type ReportTheme, type ReportThemeId } from "@/lib/export/themes";

/** Mini hoja de ejemplo con los colores y el estilo del tema. */
function Preview({ theme }: { theme: ReportTheme }) {
	const title = (
		<span
			className="block truncate font-bold"
			style={{
				fontFamily: theme.headingFont,
				fontSize: 11,
				color: theme.titleStyle === "band" ? "#fff" : theme.dark,
				textTransform: theme.titleStyle === "stacked" ? "uppercase" : undefined,
				letterSpacing: theme.titleStyle === "stacked" ? 1 : undefined,
			}}
		>
			Reunión de entre semana
		</span>
	);
	return (
		<div className="overflow-hidden rounded-lg border bg-white p-2.5" style={{ borderColor: theme.border }}>
			{theme.titleStyle === "band" ? (
				<div className="-mx-2.5 -mt-2.5 mb-2 px-2.5 py-1.5" style={{ background: theme.primary, borderBottom: `3px solid ${theme.accent}` }}>
					{title}
				</div>
			) : theme.titleStyle === "badge" ? (
				<div className="mb-2 text-center">
					<span className="inline-block rounded-full px-2.5 py-0.5" style={{ background: theme.soft, border: `1.5px solid ${theme.accent}` }}>
						{title}
					</span>
				</div>
			) : theme.titleStyle === "rule" ? (
				<div className="mb-2">
					{title}
					<div className="mt-0.5 h-[3px] rounded" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />
				</div>
			) : theme.titleStyle === "stacked" ? (
				<div className="mb-2">
					{title}
					<div className="mt-0.5 h-[2px] w-8" style={{ background: theme.accent }} />
				</div>
			) : (
				<div className="mb-2 text-center">
					{title}
					<div className="mx-auto mt-0.5 h-[2px] w-8 rounded" style={{ background: theme.accent }} />
				</div>
			)}
			<div className="overflow-hidden rounded-sm border text-[8px] leading-tight" style={{ borderColor: theme.border }}>
				<div className="flex gap-1 px-1.5 py-1 font-bold" style={{ background: theme.headerFill, color: theme.headerText }}>
					<span className="flex-1">PARTE</span>
					<span className="flex-1">ASIGNADO</span>
				</div>
				{["Tesoros de la Biblia", "Lectura de la Biblia", "Estudio bíblico"].map((label, i) => (
					<div key={label} className="flex gap-1 px-1.5 py-1" style={{ background: i % 2 === 1 ? theme.zebra : "#fff", color: theme.text }}>
						<span className="flex-1 truncate">{label}</span>
						<span className="flex-1 truncate">Nombre {i + 1}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** Congregación → Tema de reportes: se guarda al elegir. Los formatos oficiales (S-12, S-21, S-89, S-140) no lo usan. */
export function ReportThemePicker({ initial }: { initial: string | null }) {
	const [value, setValue] = useState<ReportThemeId>((REPORT_THEME_IDS as readonly string[]).includes(initial ?? "") ? (initial as ReportThemeId) : DEFAULT_REPORT_THEME);
	const [message, setMessage] = useState<string | null>(null);

	async function choose(id: ReportThemeId) {
		const previous = value;
		setValue(id);
		setMessage(null);
		const response = await fetch("/api/congregation", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reportTheme: id }),
		});
		if (!response.ok) {
			setValue(previous);
			setMessage("No se pudo guardar el tema.");
			return;
		}
		setMessage("Tema guardado.");
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{REPORT_THEME_IDS.map((id) => {
					const theme = REPORT_THEMES[id];
					const on = value === id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => choose(id)}
							aria-pressed={on}
							className={`flex flex-col gap-2.5 rounded-[20px] bg-surface p-3 text-left transition-shadow ${on ? "ring-2 ring-accent" : "hover:ring-1 hover:ring-border"}`}
						>
							<Preview theme={theme} />
							<div className="flex items-center gap-2 px-1">
								<span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.primary }} />
								<span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.accent }} />
								<div className="min-w-0 flex-1">
									<div className="text-sm font-semibold text-ink">{theme.name}</div>
									<div className="truncate text-xs text-ink-soft">{theme.tagline}</div>
								</div>
								{on && <Check size={18} className="shrink-0 text-accent" />}
							</div>
						</button>
					);
				})}
			</div>
			<p className="px-1 text-xs text-ink-soft">
				Se aplica a los reportes en Word, imagen y Excel. Los formatos oficiales (tarjeta de territorio S-12, S-21, S-89 y S-140) conservan su diseño.
				{message ? ` ${message}` : ""}
			</p>
		</div>
	);
}
