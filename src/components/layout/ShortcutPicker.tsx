"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/Input";
import { visibleGroups } from "./navItems";

// Mi perfil → acceso directo de la barra inferior: un módulo a elegir (ninguno por defecto).
export function ShortcutPicker({
	role,
	privilegeCodes,
	current,
}: {
	role: "admin" | "regular";
	privilegeCodes: string[];
	current: string | null;
}) {
	const router = useRouter();
	const [value, setValue] = useState(current ?? "");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const groups = visibleGroups(role, privilegeCodes);

	async function change(next: string) {
		setValue(next);
		setSaving(true);
		setMessage(null);
		const response = await fetch("/api/auth/shortcut", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ href: next || null }),
		});
		setSaving(false);
		if (!response.ok) {
			setMessage("No se pudo guardar.");
			setValue(current ?? "");
			return;
		}
		setMessage(next ? "Listo: aparece en la barra de abajo." : "Quitado de la barra de abajo.");
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-2 rounded-[20px] bg-surface p-4">
			<Select label="Módulo en la barra inferior" value={value} disabled={saving} onChange={(e) => change(e.target.value)}>
				<option value="">Ninguno</option>
				{groups.map((g) => (
					<optgroup key={g.label} label={g.label}>
						{g.items.map((i) => (
							<option key={i.href} value={i.href}>
								{i.label}
							</option>
						))}
					</optgroup>
				))}
			</Select>
			{message && <p className="text-xs text-ink-soft">{message}</p>}
		</div>
	);
}
