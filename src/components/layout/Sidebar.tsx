"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { activeHref, canSee, NAV_GROUPS, NOTICES_ITEM, PANEL_ITEM, visibleGroups, type NavItem } from "./navItems";

// Menú lateral solo en pantallas anchas; en móvil se navega con la barra inferior y «Más».
// Las agrupaciones son un acordeón: se expande una sola a la vez para que el menú no crezca.
export function Sidebar({
	role,
	privilegeCodes,
	fullName,
}: {
	role: "admin" | "regular";
	privilegeCodes: string[];
	fullName: string;
}) {
	const pathname = usePathname();
	const groups = visibleGroups(role, privilegeCodes);
	const top = [PANEL_ITEM, NOTICES_ITEM].filter((i) => canSee(i, role, privilegeCodes));
	const active = activeHref(pathname, [...top, ...NAV_GROUPS.flatMap((g) => g.items)].map((i) => i.href));
	const activeGroup = groups.find((g) => g.items.some((i) => i.href === active))?.label ?? null;

	const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);
	// Al navegar a otro módulo se abre la agrupación que lo contiene.
	useEffect(() => {
		if (activeGroup) setOpenGroup(activeGroup);
	}, [activeGroup]);

	function link(item: NavItem) {
		const on = item.href === active;
		return (
			<Link
				key={item.href}
				href={item.href}
				className={
					on
						? "flex min-h-11 items-center gap-3 rounded-xl bg-accent-soft px-3 text-[15px] font-semibold text-accent"
						: "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-soft hover:bg-surface-alt hover:text-ink"
				}
			>
				<item.icon size={20} />
				{item.label}
			</Link>
		);
	}

	return (
		<nav className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto p-4 [scrollbar-width:none] print:hidden md:flex [&::-webkit-scrollbar]:hidden">
			<div className="mb-5 flex items-center gap-2.5 px-3 pt-2">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-[10px]" />
				<span className="font-display text-xl font-semibold text-ink">Mi Congre</span>
			</div>
			{top.map(link)}
			{groups.map((g) => {
				const open = openGroup === g.label;
				return (
					<div key={g.label} className="mt-2 flex flex-col gap-1">
						<button
							type="button"
							onClick={() => setOpenGroup(open ? null : g.label)}
							aria-expanded={open}
							className="flex min-h-10 items-center justify-between rounded-xl px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft hover:text-ink"
						>
							{g.label}
							<ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
						</button>
						{open && g.items.map(link)}
					</div>
				);
			})}
			<ProfileMenu role={role} fullName={fullName} />
		</nav>
	);
}
