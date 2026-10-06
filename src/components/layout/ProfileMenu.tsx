"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";

const ROLE_LABEL: Record<"admin" | "regular", string> = {
	admin: "Administrador",
	regular: "Publicador",
};

function initials(fullName: string) {
	const parts = fullName.trim().split(/\s+/);
	return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProfileMenu({ role, fullName }: { role: "admin" | "regular"; fullName: string }) {
	const router = useRouter();
	const [menuOpen, setMenuOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setMenuOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [menuOpen]);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/login");
		router.refresh();
	}

	return (
		<div ref={containerRef} className="relative mt-auto">
			{menuOpen && (
				<div className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
					<Link
						href="/profile"
						onClick={() => setMenuOpen(false)}
						className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt"
					>
						<User size={15} />
						Perfil
					</Link>
					<button
						type="button"
						onClick={handleLogout}
						className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt"
					>
						<LogOut size={15} />
						Salir
					</button>
				</div>
			)}
			<button
				type="button"
				onClick={() => setMenuOpen((v) => !v)}
				aria-expanded={menuOpen}
				className="flex w-full items-center gap-2.5 rounded-xl bg-surface-alt px-3 py-2.5 text-left hover:opacity-80"
			>
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
					{initials(fullName)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-ink">{fullName}</p>
					<p className="text-xs text-ink-soft">{ROLE_LABEL[role]}</p>
				</div>
			</button>
		</div>
	);
}
