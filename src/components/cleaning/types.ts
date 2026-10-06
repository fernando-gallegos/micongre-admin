import type { CleaningKind } from "@/lib/cleaning/labels";

export interface Assignee {
	id: string;
	type: "group" | "own_congregation" | "congregation";
	groupId: string | null;
	groupName: string | null;
	groupColor: string | null;
	congregationId: string | null;
	congregationName: string | null;
	notifiedAt: string | null;
}

export interface CleaningRow {
	key: string;
	kind: CleaningKind;
	meetingType: "midweek" | "weekend" | null;
	meetingId: string | null;
	weekStart: string | null;
	taskId: string | null;
	date: string;
	dateEnd: string | null;
	cancelled: boolean;
	completedAt: string | null;
	notes: string | null;
	assignees: Assignee[];
}

export interface GroupOption {
	id: string;
	name: string;
	color: string | null;
}

export interface CongregationOption {
	id: string;
	name: string;
}

export type CleaningRef =
	| { kind: "ligera"; meetingType: "midweek" | "weekend"; meetingId: string }
	| { kind: "profunda"; weekStart: string }
	| { kind: "a_fondo"; taskId: string };

/** La referencia con la que el servidor identifica la tarea de una fila (null
 * si no se puede armar: una limpieza a fondo siempre trae su taskId). */
export function refOf(row: CleaningRow): CleaningRef | null {
	if (row.kind === "ligera" && row.meetingType && row.meetingId) {
		return { kind: "ligera", meetingType: row.meetingType, meetingId: row.meetingId };
	}
	if (row.kind === "profunda" && row.weekStart) return { kind: "profunda", weekStart: row.weekStart };
	if (row.kind === "a_fondo" && row.taskId) return { kind: "a_fondo", taskId: row.taskId };
	return null;
}
