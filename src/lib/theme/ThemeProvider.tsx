"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const ACCENTS = [
	{ key: "salvia", label: "Salvia", swatch: "#3f6b52" },
	{ key: "anil", label: "Añil", swatch: "#3d5aa3" },
	{ key: "terracota", label: "Terracota", swatch: "#b5563c" },
	{ key: "petroleo", label: "Petróleo", swatch: "#1f6f78" },
	{ key: "carbon", label: "Carbón y oro", swatch: "#9c7a24" },
] as const;

export type Theme = "light" | "dark";
export type Accent = (typeof ACCENTS)[number]["key"];

const THEME_KEY = "micongre-theme";
const ACCENT_KEY = "micongre-accent";
const DEFAULT_ACCENT: Accent = "salvia";

// Mantener en sync con el script inline de src/app/layout.tsx.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var a=localStorage.getItem('${ACCENT_KEY}');if(['${ACCENTS.map((entry) => entry.key).join("','")}'].indexOf(a)===-1){a='${DEFAULT_ACCENT}';}var r=document.documentElement;r.setAttribute('data-theme',t);r.setAttribute('data-accent',a);}catch(e){}})();`;

interface ThemeContextValue {
	theme: Theme;
	accent: Accent;
	setTheme: (theme: Theme) => void;
	setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>("light");
	const [accent, setAccentState] = useState<Accent>(DEFAULT_ACCENT);

	// El script inline en <head> ya aplicó los atributos antes del primer
	// pintado; aquí solo reflejamos ese estado en React.
	useEffect(() => {
		const root = document.documentElement;
		const currentTheme = root.getAttribute("data-theme");
		if (currentTheme === "light" || currentTheme === "dark") setThemeState(currentTheme);
		const currentAccent = root.getAttribute("data-accent");
		if (ACCENTS.some((entry) => entry.key === currentAccent)) setAccentState(currentAccent as Accent);
	}, []);

	function setTheme(next: Theme) {
		setThemeState(next);
		document.documentElement.setAttribute("data-theme", next);
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			// almacenamiento no disponible (navegación privada, etc.) — no persiste, pero no rompe la UI
		}
	}

	function setAccent(next: Accent) {
		setAccentState(next);
		document.documentElement.setAttribute("data-accent", next);
		try {
			localStorage.setItem(ACCENT_KEY, next);
		} catch {
			// almacenamiento no disponible — no persiste, pero no rompe la UI
		}
	}

	return <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
	return ctx;
}
