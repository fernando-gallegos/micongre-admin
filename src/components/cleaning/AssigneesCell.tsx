"use client";

import { SelectBox } from "@/components/ui/Input";

import { X } from "lucide-react";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";
import { Badge } from "@/components/ui/Card";
import { OWN_CONGREGATION_LABEL } from "@/lib/cleaning/labels";
import type { Assignee, CongregationOption, GroupOption } from "./types";
import { Tooltip } from "@/components/ui/Tooltip";

// Responsables de una tarea: chips (con ✕ para quitar) + un selector para
// agregar uno más — un grupo nuestro, toda nuestra congregación u otra
// congregación del salón. Una limpieza puede tener varios (p. ej. a fondo).
export function AssigneesCell({
	assignees,
	groups,
	congregations,
	disabled,
	onAdd,
	onRemove,
}: {
	assignees: Assignee[];
	groups: GroupOption[];
	congregations: CongregationOption[];
	disabled: boolean;
	onAdd: (value: string) => void;
	onRemove: (assigneeId: string) => void;
}) {
	const hasOwnCongregation = assignees.some((a) => a.type === "own_congregation");
	const availableGroups = groups.filter((g) => !assignees.some((a) => a.groupId === g.id));
	const availableCongregations = congregations.filter((c) => !assignees.some((a) => a.congregationId === c.id));
	const nothingToAdd = availableGroups.length === 0 && availableCongregations.length === 0 && hasOwnCongregation;

	return (
		<div className="flex flex-col gap-2">
			{assignees.length > 0 && (
				<ul className="flex flex-wrap gap-1.5">
					{assignees.map((a) => (
						<li key={a.id} className="inline-flex items-center gap-1">
							{a.type === "group" ? (
								<GroupBadge name={a.groupName ?? "Grupo"} color={a.groupColor} />
							) : a.type === "own_congregation" ? (
								<Badge tone="success">{OWN_CONGREGATION_LABEL}</Badge>
							) : (
								<Badge tone="warning">{a.congregationName ?? "Otra congregación"}</Badge>
							)}
							<Tooltip content="Quitar responsable">
								<button
									type="button"
									disabled={disabled}
									onClick={() => onRemove(a.id)}
									aria-label="Quitar responsable"
									className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt disabled:opacity-50"
								>
									<X size={14} />
								</button>
							</Tooltip>
						</li>
					))}
				</ul>
			)}
			{!nothingToAdd && (
				<SelectBox
					aria-label="Agregar responsable"
					value=""
					disabled={disabled}
					onChange={(e) => e.target.value && onAdd(e.target.value)}
					className="min-h-11 w-full rounded-full border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:max-w-xs"
				>
					<option value="">{assignees.length === 0 ? "Sin asignar" : "+ Agregar responsable"}</option>
					{availableGroups.length > 0 && (
						<optgroup label="Grupos de servicio">
							{availableGroups.map((g) => (
								<option key={g.id} value={`group:${g.id}`}>
									{g.name}
								</option>
							))}
						</optgroup>
					)}
					{!hasOwnCongregation && (
						<optgroup label="Nuestra congregación">
							<option value="own">{OWN_CONGREGATION_LABEL} (todos)</option>
						</optgroup>
					)}
					{availableCongregations.length > 0 && (
						<optgroup label="Otras congregaciones del salón">
							{availableCongregations.map((c) => (
								<option key={c.id} value={`congregation:${c.id}`}>
									{c.name}
								</option>
							))}
						</optgroup>
					)}
				</SelectBox>
			)}
		</div>
	);
}
