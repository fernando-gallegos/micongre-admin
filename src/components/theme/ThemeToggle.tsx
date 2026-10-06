"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const isDark = theme === "dark";

	return (
		<button
			type="button"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			aria-label={`Cambiar a tema ${isDark ? "claro" : "oscuro"}`}
			className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-opacity hover:opacity-70"
		>
			{isDark ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}
