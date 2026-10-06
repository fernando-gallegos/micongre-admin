"use client";

import { useEffect, useState } from "react";
import type { TerritoryKind } from "@/lib/territories/geo";

export interface PersonOption {
	id: string;
	fullName: string;
}

/** A quién se puede encargar un territorio de cada tipo (por privilegio). */
export function useAssignableUsers(): Record<TerritoryKind, PersonOption[]> {
	const [people, setPeople] = useState<Record<TerritoryKind, PersonOption[]>>({ general: [], public_preaching: [] });

	useEffect(() => {
		let cancelled = false;
		const kinds: TerritoryKind[] = ["general", "public_preaching"];
		Promise.all(
			kinds.map(async (kind) => {
				const response = await fetch(`/api/territories/assignees?kind=${kind}`);
				return response.ok ? ((await response.json()) as { items: PersonOption[] }).items : [];
			}),
		).then(([general, publicPreaching]) => {
			if (!cancelled) setPeople({ general: general ?? [], public_preaching: publicPreaching ?? [] });
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return people;
}
