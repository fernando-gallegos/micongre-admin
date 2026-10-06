import { Badge } from "@/components/ui/Card";
import { getAppointmentBadges } from "@/lib/publisherLabels";
import { Tooltip } from "@/components/ui/Tooltip";

// Insignias de nombramiento (AC, SM, PR, PA o P) — usadas en la lista de
// Personas y en "Compañeros de grupo" de Mi Panel.
export function AppointmentBadges({ activeAppointmentTypes }: { activeAppointmentTypes: Iterable<string> }) {
	return (
		<div className="flex flex-wrap justify-end gap-1">
			{getAppointmentBadges(activeAppointmentTypes).map((b) => (
				<Tooltip key={b.code} content={b.name}>
					<span>
						<Badge tone={b.tone}>{b.code}</Badge>
					</span>
				</Tooltip>
			))}
		</div>
	);
}
