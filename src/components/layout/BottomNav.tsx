"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Grid2x2, Home, type LucideIcon } from "lucide-react";
import { visibleGroups } from "./navItems";

interface Tab {
	key: string;
	href: string;
	label: string;
	icon: LucideIcon;
}

// Barra inferior solo en móvil: Panel, el acceso directo que cada persona elige en su perfil
// (ninguno por defecto), Avisos y Más.
export function BottomNav({
	role,
	privilegeCodes,
	shortcut,
}: {
	role: "admin" | "regular";
	privilegeCodes: string[];
	/** Ruta del módulo que la persona eligió como acceso directo (null = ninguno). */
	shortcut: string | null;
}) {
	const pathname = usePathname() ?? "";
	// Solo si sigue teniendo acceso al módulo elegido.
	const shortcutItem = shortcut
		? visibleGroups(role, privilegeCodes)
				.flatMap((g) => g.items)
				.find((i) => i.href === shortcut)
		: undefined;
	const tabs: Tab[] = [
		{ key: "panel", href: "/panel", label: "Panel", icon: Home },
		...(shortcutItem ? [{ key: "shortcut", href: shortcutItem.href, label: shortcutItem.label, icon: shortcutItem.icon }] : []),
		{ key: "notices", href: "/notifications", label: "Avisos", icon: Bell },
		{ key: "more", href: "/more", label: "Más", icon: Grid2x2 },
	];

	// «Más» agrupa todo lo que no es una de las otras pestañas (incluido el perfil).
	const direct = tabs.filter((t) => t.key !== "more");
	const activeKey = direct.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.key ?? "more";

	return (
		<nav
			aria-label="Principal"
			className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(72px+env(safe-area-inset-bottom))] items-stretch border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] print:hidden md:hidden"
		>
			{tabs.map((t) => {
				const on = t.key === activeKey;
				return (
					<Link
						key={t.key}
						href={t.href}
						aria-current={on ? "page" : undefined}
						className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
							on ? "font-semibold text-accent" : "font-medium text-ink-soft"
						}`}
					>
						<t.icon size={24} strokeWidth={1.75} />
						{t.label}
					</Link>
				);
			})}
		</nav>
	);
}
