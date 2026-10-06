import { SECTION_LABELS } from "@/lib/rbac/roles";

export interface S89Slip {
	assignmentId: string;
	sectionLabel: string;
	sectionTitle: string | null;
	publisherName: string;
	assistantName: string | null;
	meetingDate: string;
	weekLabel: string | null;
}

interface AssignmentLike {
	id: string;
	sectionType: string;
	sectionTitle: string | null;
	mainAssigneeName: string | null;
	assistantAssigneeName: string | null;
}

/** Convierte las filas de asignación de una reunión en las "papeletas" S-89
 * — una por publicador con una parte asignada, lista para mostrar/imprimir. */
export function buildS89Slips(
	meeting: { meetingDate: string; weekLabel: string | null },
	assignments: AssignmentLike[],
): S89Slip[] {
	return assignments
		.filter((a): a is AssignmentLike & { mainAssigneeName: string } => Boolean(a.mainAssigneeName))
		.map((a) => ({
			assignmentId: a.id,
			sectionLabel: SECTION_LABELS[a.sectionType] ?? a.sectionType,
			sectionTitle: a.sectionTitle,
			publisherName: a.mainAssigneeName,
			assistantName: a.assistantAssigneeName,
			meetingDate: meeting.meetingDate,
			weekLabel: meeting.weekLabel,
		}));
}
