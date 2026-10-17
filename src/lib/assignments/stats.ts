// Estadísticas de asignaciones por publicador, calculadas AL VUELO (no se guarda nada): cuántas veces y cuándo fue la última vez que tuvo cada tipo
// de asignación en los últimos 3 meses. Las filas de las reuniones (programa, roles y tareas operativas) son a la vez el plan y el registro.
//
// Presupuesto de consultas D1 (capa gratuita: ~50 por invocación): 7 en total, todas por rango de fechas y con joins (sin listas largas de ids).
import { and, eq, gte, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	midweekAssignments,
	midweekMeetings,
	operationalSchedules,
	weekendMeetings,
} from "@/db/schema";
import { effectiveMeetingDate, type MeetingSchedules } from "@/lib/attendance/summary";
import { isMeetingCancelled } from "@/lib/cleaning/meetings";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";

/** Meses hacia atrás que cuentan para las estadísticas. */
export const STATS_WINDOW_MONTHS = 3;

export interface TypeStat {
	count: number;
	/** Fecha real (AAAA-MM-DD) de la última vez dentro de la ventana. */
	last: string | null;
}

export interface UserStats {
	/** Asignaciones de cualquier tipo en la ventana (carga total). */
	load: number;
	byType: Map<string, TypeStat>;
}

export interface AssignmentStats {
	/** Ventana usada (AAAA-MM-DD, ambos incluidos). */
	window: { from: string; to: string };
	byUser: Map<string, UserStats>;
}

/** Clave estable del tipo de asignación de una parte de entre semana (principal o ayudante). */
export function midweekTypeKey(sectionType: string, sectionTitle: string | null, helper = false): string {
	switch (sectionType) {
		case "student_assignment":
			return helper ? "midweek:student_helper" : "midweek:student";
		case "living_custom":
			return "midweek:christian_living";
		case "cbs":
			return /lector/i.test(sectionTitle ?? "") ? "midweek:cbs_reader" : "midweek:cbs_conductor";
		default:
			return `midweek:${sectionType}`; // treasures_talk, spiritual_gems, bible_reading, christian_living, congregation_needs, prayer
	}
}

export const WEEKEND_TYPE_KEYS = {
	chairman: "weekend:chairman",
	watchtowerConductor: "weekend:watchtower_conductor",
	watchtowerReader: "weekend:watchtower_reader",
	prayer: "weekend:prayer",
} as const;

export const operationalTypeKey = (privilegeId: string) => `operational:${privilegeId}`;

/** Fecha desde la que cuenta la ventana: «hoy» menos N meses (mismo día del mes, o el último día si ese mes es más corto). */
export function windowStart(asOf: string, months = STATS_WINDOW_MONTHS): string {
	const d = parseISODate(asOf);
	const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
	const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
	return toISODate(target);
}

export async function readMeetingSchedules(db: Database): Promise<MeetingSchedules | null> {
	const [row] = await db
		.select({ s: congregations.meetingSchedules })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	try {
		return row?.s ? (JSON.parse(row.s) as MeetingSchedules) : null;
	} catch {
		return null;
	}
}

export async function loadAssignmentStats(db: Database, asOf = toISODate(new Date())): Promise<AssignmentStats> {
	const from = windowStart(asOf);
	const to = asOf;
	// Las fechas guardadas son el lunes (entre semana) o el sábado (fin de semana): se busca con margen y se filtra por la fecha real.
	const qFrom = toISODate(addDays(parseISODate(from), -7));
	const qTo = toISODate(addDays(parseISODate(to), 7));

	const schedules = await readMeetingSchedules(db);
	const [midweek, midweekParts, weekend, opMidweek, opWeekend] = await Promise.all([
		db
			.select({
				date: midweekMeetings.meetingDate,
				status: midweekMeetings.status,
				chairman: midweekMeetings.chairmanUserId,
				openingPrayer: midweekMeetings.openingPrayerUserId,
			})
			.from(midweekMeetings)
			.where(and(gte(midweekMeetings.meetingDate, qFrom), lte(midweekMeetings.meetingDate, qTo))),
		db
			.select({
				date: midweekMeetings.meetingDate,
				status: midweekMeetings.status,
				sectionType: midweekAssignments.sectionType,
				sectionTitle: midweekAssignments.sectionTitle,
				main: midweekAssignments.mainAssigneeId,
				assistant: midweekAssignments.assistantAssigneeId,
			})
			.from(midweekAssignments)
			.innerJoin(midweekMeetings, eq(midweekMeetings.id, midweekAssignments.meetingId))
			.where(and(gte(midweekMeetings.meetingDate, qFrom), lte(midweekMeetings.meetingDate, qTo))),
		db
			.select({
				date: weekendMeetings.meetingDate,
				status: weekendMeetings.status,
				chairman: weekendMeetings.chairmanUserId,
				conductor: weekendMeetings.watchtowerConductorId,
				reader: weekendMeetings.watchtowerReaderId,
				prayer: weekendMeetings.prayerUserId,
			})
			.from(weekendMeetings)
			.where(and(gte(weekendMeetings.meetingDate, qFrom), lte(weekendMeetings.meetingDate, qTo))),
		db
			.select({ date: midweekMeetings.meetingDate, status: midweekMeetings.status, privilegeId: operationalSchedules.privilegeId, user: operationalSchedules.assignedUserId })
			.from(operationalSchedules)
			.innerJoin(
				midweekMeetings,
				and(eq(midweekMeetings.id, operationalSchedules.meetingId), eq(operationalSchedules.meetingType, "midweek")),
			)
			.where(and(gte(midweekMeetings.meetingDate, qFrom), lte(midweekMeetings.meetingDate, qTo))),
		db
			.select({ date: weekendMeetings.meetingDate, status: weekendMeetings.status, privilegeId: operationalSchedules.privilegeId, user: operationalSchedules.assignedUserId })
			.from(operationalSchedules)
			.innerJoin(
				weekendMeetings,
				and(eq(weekendMeetings.id, operationalSchedules.meetingId), eq(operationalSchedules.meetingType, "weekend")),
			)
			.where(and(gte(weekendMeetings.meetingDate, qFrom), lte(weekendMeetings.meetingDate, qTo))),
	]);

	const byUser = new Map<string, UserStats>();
	const add = (userId: string | null, typeKey: string, date: string) => {
		if (!userId) return;
		const user = byUser.get(userId) ?? byUser.set(userId, { load: 0, byType: new Map() }).get(userId)!;
		user.load++;
		const stat = user.byType.get(typeKey) ?? user.byType.set(typeKey, { count: 0, last: null }).get(typeKey)!;
		stat.count++;
		if (!stat.last || date > stat.last) stat.last = date;
	};
	/** Fecha real de la reunión si cuenta (no cancelada y dentro de la ventana); si no, null. */
	const counted = (stored: string, status: string, type: "midweek" | "weekend"): string | null => {
		if (isMeetingCancelled(status)) return null;
		const date = effectiveMeetingDate(stored, type, schedules);
		return date >= from && date <= to ? date : null;
	};

	for (const m of midweek) {
		const date = counted(m.date, m.status, "midweek");
		if (!date) continue;
		add(m.chairman, "midweek:chairman", date);
		add(m.openingPrayer, "midweek:opening_prayer", date);
	}
	for (const p of midweekParts) {
		const date = counted(p.date, p.status, "midweek");
		if (!date) continue;
		add(p.main, midweekTypeKey(p.sectionType, p.sectionTitle), date);
		add(p.assistant, midweekTypeKey(p.sectionType, p.sectionTitle, true), date);
	}
	for (const m of weekend) {
		const date = counted(m.date, m.status, "weekend");
		if (!date) continue;
		add(m.chairman, WEEKEND_TYPE_KEYS.chairman, date);
		add(m.conductor, WEEKEND_TYPE_KEYS.watchtowerConductor, date);
		add(m.reader, WEEKEND_TYPE_KEYS.watchtowerReader, date);
		add(m.prayer, WEEKEND_TYPE_KEYS.prayer, date);
	}
	for (const o of opMidweek) {
		const date = counted(o.date, o.status, "midweek");
		if (date) add(o.user, operationalTypeKey(o.privilegeId), date);
	}
	for (const o of opWeekend) {
		const date = counted(o.date, o.status, "weekend");
		if (date) add(o.user, operationalTypeKey(o.privilegeId), date);
	}

	return { window: { from, to }, byUser };
}
