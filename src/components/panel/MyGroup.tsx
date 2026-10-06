"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar, List, SectionLabel } from "@/components/ui/Layout";
import { AppointmentBadges } from "@/components/publishers/AppointmentBadges";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";

interface Group {
	name: string;
	color?: string | null;
	overseerName: string | null;
	assistantName: string | null;
	members: { id: string; fullName: string; activeAppointmentTypes: string[] }[];
}

export function MyGroup({ group }: { group: Group | null }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<section>
			<SectionLabel>Mi grupo de servicio</SectionLabel>
			{!group ? (
				<List>
					<p className="px-4 py-5 text-sm text-ink-soft">Todavía no tienes un grupo asignado.</p>
				</List>
			) : (
				<List>
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						aria-expanded={expanded}
						className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-alt"
					>
						<div className="min-w-0 flex-1">
							<GroupBadge name={group.name} color={group.color} />
							<p className="mt-2 text-[13px] text-ink-soft">
								<span className="font-medium text-ink">Superintendente:</span> {group.overseerName ?? "—"}
							</p>
							<p className="text-[13px] text-ink-soft">
								<span className="font-medium text-ink">Auxiliar:</span> {group.assistantName ?? "—"}
							</p>
						</div>
						<ChevronDown size={18} className={`shrink-0 text-ink-soft transition-transform ${expanded ? "rotate-180" : ""}`} />
					</button>
					{expanded && (
						<p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">Compañeros de grupo</p>
					)}
					{expanded &&
						group.members.map((m) => (
							<div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
								<Avatar name={m.fullName} size={36} />
								<span className="min-w-0 flex-1 text-sm text-ink">{m.fullName}</span>
								<AppointmentBadges activeAppointmentTypes={m.activeAppointmentTypes} />
							</div>
						))}
				</List>
			)}
		</section>
	);
}
