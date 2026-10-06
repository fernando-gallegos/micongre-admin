import type { Config } from "tailwindcss";

// Colores definidos con variables CSS: sin esto, los modificadores de opacidad
// (bg-surface/95, bg-ink-soft/40...) no generan nada. Con color-mix se mezclan con transparente.
const themed = (variable: string) =>
	(({ opacityValue }: { opacityValue?: string }) =>
		opacityValue === undefined || opacityValue === "1"
			? `var(${variable})`
			: `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

export default {
	content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["var(--font-sans)", "system-ui", "sans-serif"],
				display: ["var(--font-display)", "Georgia", "serif"],
			},
			colors: {
				bg: themed("--bg"),
				surface: themed("--surface"),
				"surface-alt": themed("--surface-alt"),
				border: themed("--line"),
				ink: themed("--ink"),
				"ink-soft": themed("--ink-soft"),
				accent: {
					DEFAULT: themed("--accent"),
					strong: themed("--accent-strong"),
					soft: themed("--accent-soft"),
					ink: themed("--accent-ink"),
				},
				warn: {
					DEFAULT: themed("--warn"),
					soft: themed("--warn-soft"),
				},
				mwb: {
					treasures: themed("--mwb-treasures"),
					"treasures-soft": themed("--mwb-treasures-soft"),
					ministry: themed("--mwb-ministry"),
					"ministry-soft": themed("--mwb-ministry-soft"),
					living: themed("--mwb-living"),
					"living-soft": themed("--mwb-living-soft"),
				},
				weekend: {
					watchtower: themed("--weekend-watchtower"),
					"watchtower-soft": themed("--weekend-watchtower-soft"),
					talk: themed("--weekend-talk"),
					"talk-soft": themed("--weekend-talk-soft"),
				},
			},
		},
	},
	plugins: [],
} satisfies Config;
