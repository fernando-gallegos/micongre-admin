import { Trash2 } from "lucide-react";
import { BrotherSelector } from "@/components/shared/BrotherSelector";
import { IconButton } from "@/components/ui/Layout";
import type { EligibleUser } from "@/lib/rbac/eligibility";
import { CollisionBadge } from "./CollisionBadge";

export interface OperationalSlot {
	id: string;
	privilegeId: string;
	privilegeName: string;
	position: string | null;
	assignedUserId: string | null;
	assignedUserName: string | null;
	warnings: string[];
}

/** Fila rol → persona. Va dentro de una `List` (las separa una línea fina). */
export function TaskCell({
	slot,
	options,
	onAssign,
	onRemove,
}: {
	slot: OperationalSlot;
	options: EligibleUser[];
	onAssign: (userId: string | null) => void;
	onRemove: () => void;
}) {
	return (
		<div className="px-4 py-2">
			<div className="flex min-h-12 items-center gap-2">
				<p className="min-w-0 flex-1 text-[15px] font-medium text-ink">
					{slot.privilegeName}
					{slot.position && <span className="ml-1.5 font-normal text-ink-soft">— {slot.position}</span>}
				</p>
				<div className="w-40 shrink-0 sm:w-56">
					<BrotherSelector value={slot.assignedUserId} options={options} onChange={onAssign} />
				</div>
				<div className="-mr-2">
					<IconButton label="Quitar tarea" icon={Trash2} onClick={onRemove} tone="danger" />
				</div>
			</div>
			<CollisionBadge warnings={slot.warnings} />
		</div>
	);
}
