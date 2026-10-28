// Arma, para UNA reunión, las casillas vacías de cada módulo (entre semana, fin de semana, tareas operativas), reúne elegibles y estadísticas y
// llama al motor puro (`suggest.ts`). Solo lee: aplicar la propuesta lo hace la pantalla llenando su borrador y guardando con los endpoints de siempre,
// que revalidan la elegibilidad. Consultas D1 por pulsación: ~5 (elegibilidad) + 7 (estadísticas) + 3-4 (reunión) ≈ 16, bajo el límite de la capa gratuita.
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	midweekAssignments,
	midweekMeetings,
	operationalSchedules,
	privileges,
	speakers,
	weekendMeetings,
} from "@/db/schema";
import { eligibleFromContext, loadEligibilityContext, type EligibilityContext } from "@/lib/rbac/eligibility";
import { NON_MEETING_OPERATIONAL_IDS, PRIVILEGE_IDS, SECTION_GROUP_BY_TYPE, SECTION_GROUP_LABELS, SECTION_LABELS } from "@/lib/rbac/roles";
import { getStudentPartRule } from "@/lib/rbac/studentParts";
import { proposeAssignments, type SlotProposal, type SlotSpec } from "./suggest";
import { effectiveMeetingDate } from "@/lib/attendance/summary";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { loadAssignmentStats, midweekTypeKey, readMeetingSchedules, operationalTypeKey, WEEKEND_TYPE_KEYS, type AssignmentStats } from "./stats";

export type AutoAssignModule = "midweek" | "weekend" | "operational-midweek" | "operational-weekend";

export interface AutoAssignResult {
	window: { from: string; to: string };
	/** Casillas que ya tenían a alguien (no se tocan). */
	alreadyAssigned: number;
	slots: SlotProposal[];
}

interface Plan {
	slots: SlotSpec[];
	alreadyAssigned: number;
	hardBusy: string[];
	softBusy: string[];
}

const NOT_AUTOASSIGNED_OPERATIONAL: string[] = NON_MEETING_OPERATIONAL_IDS;

const present = (ids: (string | null | undefined)[]) => ids.filter((v): v is string => !!v);

/** Quien ya tiene una tarea operativa asignada en esa reunión. */
async function operationalUsers(db: Database, meetingType: "midweek" | "weekend", meetingId: string): Promise<string[]> {
	const rows = await db
		.select({ user: operationalSchedules.assignedUserId })
		.from(operationalSchedules)
		.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)));
	return present(rows.map((r) => r.user));
}

async function planMidweek(db: Database, meetingId: string): Promise<Plan> {
	const [meeting] = await db.select().from(midweekMeetings).where(eq(midweekMeetings.id, meetingId)).limit(1);
	if (!meeting) throw new Error("not_found");
	const [cong] = await db
		.select({ skip: congregations.skipOpeningPrayer })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	const rows = await db.select().from(midweekAssignments).where(eq(midweekAssignments.meetingId, meetingId)).orderBy(asc(midweekAssignments.sequenceOrder));

	const slots: SlotSpec[] = [];
	let already = 0;
	const hard: string[] = present([meeting.chairmanUserId, meeting.openingPrayerUserId]);

	if (meeting.chairmanUserId) already++;
	else slots.push({ key: "chairman", label: "Presidente", group: "Presidencia", privilegeId: PRIVILEGE_IDS.MIDWEEK_CHAIRMAN, typeKey: "midweek:chairman" });
	if (!cong?.skip) {
		if (meeting.openingPrayerUserId) already++;
		else slots.push({ key: "openingPrayer", label: "Oración inicial", group: "Presidencia", privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER, typeKey: "midweek:opening_prayer" });
	}

	for (const row of rows) {
		hard.push(...present([row.mainAssigneeId, row.assistantAssigneeId]));
		const privilegeId =
			row.privilegeId ??
			(row.sectionType === "student_assignment"
				? PRIVILEGE_IDS.STUDENT_ASSIGNMENT
				: row.sectionType === "prayer"
					? PRIVILEGE_IDS.CONGREGATION_PRAYER
					: PRIVILEGE_IDS.CHRISTIAN_LIVING);
		const base =
			row.sectionType === "prayer"
				? "Oración final"
				: row.sectionType === "cbs"
					? `Estudio bíblico: ${row.sectionTitle ?? ""}`.trim()
					: (row.sectionTitle?.trim() || SECTION_LABELS[row.sectionType] || row.sectionType);
		const label = `${row.partNumber != null ? `${row.partNumber}. ` : ""}${base}${row.room === "auxiliary" ? " (sala auxiliar)" : ""}`;
		const groupId = SECTION_GROUP_BY_TYPE[row.sectionType];
		const group = row.sectionType === "prayer" ? "Presidencia" : groupId ? SECTION_GROUP_LABELS[groupId] : undefined;
		const rule = row.sectionType === "student_assignment" ? getStudentPartRule(row.sectionTitle) : null;

		if (row.mainAssigneeId) already++;
		else slots.push({ key: `a:${row.id}:main`, label, group, privilegeId, typeKey: midweekTypeKey(row.sectionType, row.sectionTitle), maleOnly: rule?.requiresMale });

		if (rule?.hasHelper) {
			if (row.assistantAssigneeId) already++;
			else {
				slots.push({
					key: `a:${row.id}:assistant`,
					label: `${label} — ayudante`,
					group,
					privilegeId: PRIVILEGE_IDS.STUDENT_ASSIGNMENT,
					typeKey: midweekTypeKey(row.sectionType, row.sectionTitle, true),
					helperOf: row.mainAssigneeId ? { userId: row.mainAssigneeId } : { slotKey: `a:${row.id}:main` },
				});
			}
		}
	}
	return { slots, alreadyAssigned: already, hardBusy: hard, softBusy: await operationalUsers(db, "midweek", meetingId) };
}

async function planWeekend(db: Database, meetingId: string): Promise<Plan> {
	const [m] = await db
		.select({
			chairman: weekendMeetings.chairmanUserId,
			conductor: weekendMeetings.watchtowerConductorId,
			reader: weekendMeetings.watchtowerReaderId,
			prayer: weekendMeetings.prayerUserId,
			speakerUser: speakers.userId,
		})
		.from(weekendMeetings)
		.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
		.where(eq(weekendMeetings.id, meetingId))
		.limit(1);
	if (!m) throw new Error("not_found");

	const defs: { value: string | null; spec: SlotSpec }[] = [
		{ value: m.chairman, spec: { key: "chairman", label: "Presidente", group: "Presidencia", privilegeId: PRIVILEGE_IDS.WEEKEND_CHAIRMAN, typeKey: WEEKEND_TYPE_KEYS.chairman } },
		{ value: m.prayer, spec: { key: "prayer", label: "Oración", group: "Presidencia", privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER, typeKey: WEEKEND_TYPE_KEYS.prayer } },
		// El conductor de La Atalaya no se rota al azar: va quien tenga el nombramiento (o, si no hay, el privilegio).
		{
			value: m.conductor,
			spec: { key: "watchtowerConductor", label: "Conductor de La Atalaya", group: "La Atalaya", privilegeId: PRIVILEGE_IDS.WATCHTOWER_CONDUCTOR, typeKey: WEEKEND_TYPE_KEYS.watchtowerConductor, preferAppointment: "watchtower_conductor" },
		},
		{ value: m.reader, spec: { key: "watchtowerReader", label: "Lector de La Atalaya", group: "La Atalaya", privilegeId: PRIVILEGE_IDS.WATCHTOWER_READER, typeKey: WEEKEND_TYPE_KEYS.watchtowerReader } },
	];
	return {
		slots: defs.filter((d) => !d.value).map((d) => d.spec),
		alreadyAssigned: defs.filter((d) => d.value).length,
		hardBusy: present([m.chairman, m.conductor, m.reader, m.prayer, m.speakerUser]),
		softBusy: await operationalUsers(db, "weekend", meetingId),
	};
}

async function planOperational(db: Database, meetingType: "midweek" | "weekend", meetingId: string): Promise<Plan> {
	const rows = await db
		.select({ id: operationalSchedules.id, privilegeId: operationalSchedules.privilegeId, position: operationalSchedules.position, user: operationalSchedules.assignedUserId, name: privileges.name })
		.from(operationalSchedules)
		.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
		.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)))
		.orderBy(asc(privileges.name));

	// Lo que ya tiene el programa de la reunión queda como último recurso (no es del mismo módulo).
	let programUsers: string[] = [];
	if (meetingType === "midweek") {
		const [meeting] = await db.select({ c: midweekMeetings.chairmanUserId, p: midweekMeetings.openingPrayerUserId }).from(midweekMeetings).where(eq(midweekMeetings.id, meetingId)).limit(1);
		const parts = await db.select({ m: midweekAssignments.mainAssigneeId, a: midweekAssignments.assistantAssigneeId }).from(midweekAssignments).where(eq(midweekAssignments.meetingId, meetingId));
		programUsers = present([meeting?.c, meeting?.p, ...parts.flatMap((p) => [p.m, p.a])]);
	} else {
		const [w] = await db
			.select({ c: weekendMeetings.chairmanUserId, d: weekendMeetings.watchtowerConductorId, r: weekendMeetings.watchtowerReaderId, p: weekendMeetings.prayerUserId, s: speakers.userId })
			.from(weekendMeetings)
			.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
			.where(eq(weekendMeetings.id, meetingId))
			.limit(1);
		programUsers = present([w?.c, w?.d, w?.r, w?.p, w?.s]);
	}

	const assignable = rows.filter((r) => !NOT_AUTOASSIGNED_OPERATIONAL.includes(r.privilegeId));
	const audioVideo: string[] = [PRIVILEGE_IDS.AUDIO_CONSOLE, PRIVILEGE_IDS.VIDEO_ZOOM];
	return {
		slots: assignable
			.filter((r) => !r.user)
			.map((r) => ({
				key: `o:${r.id}`,
				label: r.position ? `${r.name} — ${r.position}` : r.name,
				group: audioVideo.includes(r.privilegeId) ? "Audio y video" : "Acomodadores y otras tareas",
				privilegeId: r.privilegeId,
				typeKey: operationalTypeKey(r.privilegeId),
			})),
		alreadyAssigned: assignable.filter((r) => r.user).length,
		hardBusy: present(rows.map((r) => r.user)),
		softBusy: programUsers,
	};
}

/** Día anterior a la fecha real de la reunión (según el día de reunión configurado); undefined si no existe. */
async function dayBeforeMeeting(db: Database, module: AutoAssignModule, meetingId: string): Promise<string | undefined> {
	const type: "midweek" | "weekend" = module === "midweek" || module === "operational-midweek" ? "midweek" : "weekend";
	const table = type === "midweek" ? midweekMeetings : weekendMeetings;
	const [row] = await db.select({ date: table.meetingDate }).from(table).where(eq(table.id, meetingId)).limit(1);
	if (!row) return undefined;
	const real = effectiveMeetingDate(row.date, type, await readMeetingSchedules(db));
	return toISODate(addDays(parseISODate(real), -1));
}

/** Propuesta para una reunión: una persona por casilla vacía (más la lista de candidatos con sus números de los últimos 3 meses). */
export async function suggestForMeeting(
	db: Database,
	module: AutoAssignModule,
	meetingId: string,
	asOf?: string,
): Promise<AutoAssignResult> {
	// Las estadísticas cuentan hasta el día antes de ESA reunión (no hasta hoy): al planear semanas futuras también pesa lo que ya
	// quedó asignado entre hoy y esa reunión, para no proponer a la misma persona varias semanas seguidas.
	const statsAsOf = asOf ?? (await dayBeforeMeeting(db, module, meetingId));
	const [ctx, stats, plan] = await Promise.all([
		loadEligibilityContext(db),
		loadAssignmentStats(db, statsAsOf),
		module === "midweek"
			? planMidweek(db, meetingId)
			: module === "weekend"
				? planWeekend(db, meetingId)
				: planOperational(db, module === "operational-midweek" ? "midweek" : "weekend", meetingId),
	]);
	return buildResult(ctx, stats, plan, asOf);
}

function buildResult(ctx: EligibilityContext, stats: AssignmentStats, plan: Plan, asOf?: string): AutoAssignResult {
	const cache = new Map<string, ReturnType<typeof eligibleFromContext>>();
	const eligible = (privilegeId: string) => {
		const hit = cache.get(privilegeId) ?? eligibleFromContext(ctx, privilegeId, { asOfDate: asOf });
		cache.set(privilegeId, hit);
		return hit;
	};
	const holders = new Map<string, Set<string>>();
	for (const [userId, types] of ctx.appointments) for (const type of types) (holders.get(type) ?? holders.set(type, new Set()).get(type)!).add(userId);

	const slots = proposeAssignments({
		slots: plan.slots,
		eligible,
		stats: stats.byUser,
		hardBusy: plan.hardBusy,
		softBusy: plan.softBusy,
		person: (id) => ctx.users.get(id),
		appointmentHolders: (type) => holders.get(type) ?? new Set(),
	});
	return { window: stats.window, alreadyAssigned: plan.alreadyAssigned, slots };
}

/** Para pruebas: el mismo cálculo con datos ya cargados. */
export const _testing = { buildResult };
