import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { midweekAssignments, midweekMeetings, operationalSchedules, privileges, speakers, weekendMeetings } from "@/db/schema";
import { SECTION_LABELS } from "@/lib/rbac/roles";

/**
 * Alertas de colisión no bloqueantes (spec: "alerta de colisiones", no un
 * bloqueo duro) — avisa si la persona ya tiene otra asignación el mismo día
 * (programa de la reunión o tareas operativas). El admin puede seguir
 * guardando; solo se le avisa.
 */

/** Asignaciones de la reunión (programa + tareas operativas) por persona. */
export async function listMeetingAssignments(
	db: Database,
	meetingType: "midweek" | "weekend",
	meetingId: string,
): Promise<{ userId: string; label: string; operationalId?: string }[]> {
	const out: { userId: string; label: string; operationalId?: string }[] = [];

	if (meetingType === "midweek") {
		const [meeting] = await db
			.select({ chairmanUserId: midweekMeetings.chairmanUserId })
			.from(midweekMeetings)
			.where(eq(midweekMeetings.id, meetingId))
			.limit(1);
		if (meeting?.chairmanUserId) out.push({ userId: meeting.chairmanUserId, label: "Presidente" });

		const rows = await db
			.select({
				sectionType: midweekAssignments.sectionType,
				sectionTitle: midweekAssignments.sectionTitle,
				mainAssigneeId: midweekAssignments.mainAssigneeId,
				assistantAssigneeId: midweekAssignments.assistantAssigneeId,
			})
			.from(midweekAssignments)
			.where(eq(midweekAssignments.meetingId, meetingId));
		for (const r of rows) {
			const label =
				r.sectionType === "living_custom"
					? (r.sectionTitle ?? "Asignación")
					: (SECTION_LABELS[r.sectionType] ?? r.sectionType);
			if (r.mainAssigneeId) out.push({ userId: r.mainAssigneeId, label });
			if (r.assistantAssigneeId) out.push({ userId: r.assistantAssigneeId, label: `${label} (ayudante)` });
		}
	} else {
		const [meeting] = await db
			.select({
				chairmanUserId: weekendMeetings.chairmanUserId,
				speakerUserId: speakers.userId,
				watchtowerConductorId: weekendMeetings.watchtowerConductorId,
				watchtowerReaderId: weekendMeetings.watchtowerReaderId,
				prayerUserId: weekendMeetings.prayerUserId,
			})
			.from(weekendMeetings)
			.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
			.where(eq(weekendMeetings.id, meetingId))
			.limit(1);
		const roles: [string, string | null | undefined][] = [
			["Presidente", meeting?.chairmanUserId],
			["Orador", meeting?.speakerUserId],
			["Conductor de La Atalaya", meeting?.watchtowerConductorId],
			["Lector de La Atalaya", meeting?.watchtowerReaderId],
			["Oración", meeting?.prayerUserId],
		];
		for (const [label, userId] of roles) if (userId) out.push({ userId, label });
	}

	const tasks = await db
		.select({
			id: operationalSchedules.id,
			userId: operationalSchedules.assignedUserId,
			name: privileges.name,
			position: operationalSchedules.position,
		})
		.from(operationalSchedules)
		.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
		.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)));
	for (const t of tasks) {
		if (t.userId) {
			out.push({ userId: t.userId, label: `${t.name}${t.position ? ` (${t.position})` : ""}`, operationalId: t.id });
		}
	}

	return out;
}

export async function checkOperationalCollisions(
	db: Database,
	meetingType: "midweek" | "weekend",
	meetingId: string,
	assignedUserId: string,
	excludeScheduleId?: string,
): Promise<string[]> {
	const all = await listMeetingAssignments(db, meetingType, meetingId);
	const others = all
		.filter((a) => a.userId === assignedUserId && (!excludeScheduleId || a.operationalId !== excludeScheduleId))
		.map((a) => a.label);
	return others.length > 0 ? [`Ya está asignado este día como: ${[...new Set(others)].join(", ")}.`] : [];
}
