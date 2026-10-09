"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, User, UserPlus, X } from "lucide-react";
import { removeAccount, switchAccount, useAccounts } from "@/components/auth/useAccounts";

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
	const { accounts, reload } = useAccounts(menuOpen);
	const [switching, setSwitching] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

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

	async function handleSwitch(id: string) {
		setSwitching(id);
		setNotice(null);
		const ok = await switchAccount(id);
		if (!ok) {
			setSwitching(null);
			setNotice("La sesión de esa cuenta venció: vuelve a iniciar sesión con ella.");
			void reload();
		}
	}

	async function handleRemove(id: string) {
		await removeAccount(id);
		void reload();
	}

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/login");
		router.refresh();
	}

	return (
		<div ref={containerRef} className="relative mt-auto">
			{menuOpen && (
				<div className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
					{accounts.length > 0 && (
						<div className="border-b border-border pb-1">
							<p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Cambiar de cuenta</p>
							{accounts.map((a) => (
								<div key={a.id} className="flex items-center">
									<button
										type="button"
										disabled={switching !== null}
										onClick={() => handleSwitch(a.id)}
										className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt disabled:opacity-60"
									>
										<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
											{initials(a.fullName)}
										</span>
										<span className="truncate">{switching === a.id ? "Cambiando..." : a.fullName}</span>
									</button>
									<button
										type="button"
										aria-label={`Quitar a ${a.fullName} de este dispositivo`}
										title="Quitar de este dispositivo"
										onClick={() => handleRemove(a.id)}
										className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt"
									>
										<X size={14} />
									</button>
								</div>
							))}
						</div>
					)}
					{notice && <p className="px-3 py-2 text-xs text-warn">{notice}</p>}
					<Link
						href="/login?add=1"
						onClick={() => setMenuOpen(false)}
						className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt"
					>
						<UserPlus size={15} />
						Agregar cuenta
					</Link>
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
