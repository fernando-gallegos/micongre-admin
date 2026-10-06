import { AlertTriangle } from "lucide-react";

/** Alerta no bloqueante — el admin puede guardar igual, solo se le avisa. */
export function CollisionBadge({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) return null;

	return (
		<div className="mb-1 flex items-start gap-1.5 rounded-xl bg-warn-soft px-3 py-1.5 text-xs text-warn">
			<AlertTriangle size={13} className="mt-0.5 shrink-0" />
			<span>{warnings.join(" ")}</span>
		</div>
	);
}
