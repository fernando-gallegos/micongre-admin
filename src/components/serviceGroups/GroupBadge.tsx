import { Badge } from "@/components/ui/Card";

// El nombre de un grupo de servicio, pintado con su color propio — usado en
// cualquier lugar de la app donde se muestre el grupo (publicadores, Mi
// Panel, evaluaciones de contingencia, etc.), no solo en Grupos de servicio.
// Sin color asignado, cae a un Badge neutro normal.
export function GroupBadge({ name, color }: { name: string; color?: string | null }) {
	if (!color) return <Badge tone="neutral">{name}</Badge>;
	return (
		<span
			className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
			style={{ backgroundColor: `${color}26`, color }}
		>
			{name}
		</span>
	);
}
