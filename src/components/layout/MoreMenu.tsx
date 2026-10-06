"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LogOut, Search } from "lucide-react";
import { Avatar, List, ListRow, PageHeader, SectionLabel } from "@/components/ui/Layout";
import { visibleGroups } from "./navItems";

// «Más» (móvil): todos los módulos a los que se tiene acceso, agrupados, con buscador.
export function MoreMenu({
	role,
	privilegeCodes,
	fullName,
}: {
	role: "admin" | "regular";
	privilegeCodes: string[];
	fullName: string;
}) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();

	const groups = visibleGroups(role, privilegeCodes)
		.map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q)) }))
		.filter((g) => g.items.length > 0);

	async function logout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/login");
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Más" />

			<label className="flex min-h-12 items-center gap-3 rounded-full bg-surface px-4 text-ink-soft">
				<Search size={20} />
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Buscar módulo"
					className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft focus:outline-none"
				/>
			</label>

			{groups.map((g) => (
				<section key={g.label}>
					<SectionLabel>{g.label}</SectionLabel>
					<List>
						{g.items.map((item) => (
							<ListRow
								key={item.href}
								href={item.href}
								leading={<item.icon size={22} className="text-accent" />}
								title={<span className="font-normal">{item.label}</span>}
								trailing={<ChevronRight size={18} className="text-ink-soft" />}
							/>
						))}
					</List>
				</section>
			))}

			{!q && (
				<section>
					<SectionLabel>Cuenta</SectionLabel>
					<List>
						<ListRow
							href="/profile"
							leading={<Avatar name={fullName} size={32} />}
							title={<span className="font-normal">Mi perfil</span>}
							subtitle={fullName}
							trailing={<ChevronRight size={18} className="text-ink-soft" />}
						/>
						<ListRow
							onClick={logout}
							leading={<LogOut size={22} className="text-red-600" />}
							title={<span className="font-normal text-red-600">Cerrar sesión</span>}
						/>
					</List>
				</section>
			)}

			{q && groups.length === 0 && <p className="text-sm text-ink-soft">Ningún módulo coincide con la búsqueda.</p>}
		</div>
	);
}
