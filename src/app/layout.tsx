import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme/ThemeProvider";
import "./globals.css";

const publicSans = Public_Sans({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-sans",
	display: "swap",
});

const fraunces = Fraunces({
	subsets: ["latin"],
	weight: ["500", "600"],
	variable: "--font-display",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Mi Congre",
	description: "Administración de congregación",
	icons: { icon: [{ url: "/logo.svg", type: "image/svg+xml" }], shortcut: "/logo.svg", apple: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="es" suppressHydrationWarning className={`${publicSans.variable} ${fraunces.variable}`}>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body className="min-h-screen antialiased">
				<ThemeProvider>{children}</ThemeProvider>
			</body>
		</html>
	);
}
