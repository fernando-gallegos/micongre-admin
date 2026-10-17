import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	midweekAssignments,
	midweekMeetings,
	operationalSchedules,
	privileges,
	publicTalkOutlines,
	songs,
	speakerCongregations,
	speakerOutlines,
	speakers,
	users,
	weekendMeetings,
} from "@/db/schema";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { dayLabel, time12 } from "./meetingDates";

export const UNASSIGNED = "Sin asignar";

export async function loadMeetingTimes(db: Database): Promise<{ midweek: string | null; weekend: string | null }> {
	const [row] = await db
		.select({ s: congregations.meetingSchedules })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	let parsed: { midweek?: { time?: string } | null; weekend?: { time?: string } | null } = {};
	try {
		parsed = row?.s ? JSON.parse(row.s) : {};
	} catch {
		parsed = {};
	}
	return { midweek: time12(parsed.midweek?.time), weekend: time12(parsed.weekend?.time) };
}

/** "martes 6 de octubre de 2026 · 7:30 p.m." */
export function whenLabel(date: string, time: string | null): string {
	return time ? `${dayLabel(date)} · ${time}` : dayLabel(date);
}

async function nameMap(db: Database, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
	const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
	const map = new Map<string, string>();
	for (let i = 0; i < unique.length; i += 80) {
		const rows = await db
			.select({ id: users.id, fullName: users.fullName })
			.from(users)
			.where(inArray(users.id, unique.slice(i, i + 80)));
		for (const r of rows) map.set(r.id, r.fullName);
	}
	return map;
}

export interface MidweekPart {
	sectionType: string;
	sectionTitle: string | null;
	partNumber: number | null;
	room: "main" | "auxiliary";
	durationMinutes: number | null;
	main: string | null;
	assistant: string | null;
}
export interface MidweekData {
	id: string;
	date: string;
	weekLabel: string | null;
	status: string;
	chairman: string | null;
	openingSong: number | null;
	closingSong: number | null;
	middleSong: number | null;
	/** Oración inicial (null si no está asignada o la congregación la omite). */
	openingPrayer: string | null;
	skipOpeningPrayer: boolean;
	studyLesson: string | null;
	hasAuxRoom: boolean;
	parts: MidweekPart[];
}

export async function loadMidweek(db: Database, from: string, to: string): Promise<MidweekData[]> {
	const meetings = await db
		.select()
		.from(midweekMeetings)
		.where(and(gte(midweekMeetings.meetingDate, from), lte(midweekMeetings.meetingDate, to)))
		.orderBy(asc(midweekMeetings.meetingDate));
	if (meetings.length === 0) return [];

	const [cong] = await db
		.select({ skip: congregations.skipOpeningPrayer })
		.from(congregations)
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.limit(1);
	const skipOpeningPrayer = !!cong?.skip;

	const ids = meetings.map((m) => m.id);
	const rows: (typeof midweekAssignments.$inferSelect)[] = [];
	for (let i = 0; i < ids.length; i += 80) {
		rows.push(
			...(await db
				.select()
				.from(midweekAssignments)
				.where(inArray(midweekAssignments.meetingId, ids.slice(i, i + 80)))
				.orderBy(asc(midweekAssignments.sequenceOrder))),
		);
	}
	const names = await nameMap(db, [
		...meetings.map((m) => m.chairmanUserId),
		...meetings.map((m) => m.openingPrayerUserId),
		...rows.flatMap((r) => [r.mainAssigneeId, r.assistantAssigneeId]),
	]);

	return meetings.map((m) => ({
		id: m.id,
		date: m.meetingDate,
		weekLabel: m.weekLabel,
		status: m.status,
		chairman: m.chairmanUserId ? (names.get(m.chairmanUserId) ?? null) : null,
		openingSong: m.openingSongNumber,
		closingSong: m.closingSongNumber,
		middleSong: m.middleSongNumber,
		skipOpeningPrayer,
		openingPrayer: !skipOpeningPrayer && m.openingPrayerUserId ? (names.get(m.openingPrayerUserId) ?? null) : null,
		studyLesson: m.studyLessonReference,
		hasAuxRoom: m.hasAuxRoom,
		parts: rows
			.filter((r) => r.meetingId === m.id)
			.map((r) => ({
				sectionType: r.sectionType,
				sectionTitle: r.sectionTitle,
				partNumber: r.partNumber,
				room: r.room,
				durationMinutes: r.durationMinutes,
				main: r.mainAssigneeId ? (names.get(r.mainAssigneeId) ?? null) : null,
				assistant: r.assistantAssigneeId ? (names.get(r.assistantAssigneeId) ?? null) : null,
			})),
	}));
}

export interface WeekendData {
	id: string;
	date: string;
	status: string;
	chairman: string | null;
	speaker: string | null;
	speakerCongregation: string | null;
	talk: string | null;
	/** Título del bosquejo, sin el número. */
	talkTitle: string | null;
	/** Canción que ese orador usa con ese discurso (número del catálogo). */
	talkSong: number | null;
	/** La reunión empieza con La Atalaya y el discurso público va después. */
	watchtowerFirst: boolean;
	watchtowerTitle: string | null;
	watchtowerSong: number | null;
	closingSong: number | null;
	conductor: string | null;
	reader: string | null;
	prayer: string | null;
}

export async function loadWeekend(db: Database, from: string, to: string): Promise<WeekendData[]> {
	const meetings = await db
		.select({
			id: weekendMeetings.id,
			date: weekendMeetings.meetingDate,
			status: weekendMeetings.status,
			chairmanUserId: weekendMeetings.chairmanUserId,
			conductorId: weekendMeetings.watchtowerConductorId,
			readerId: weekendMeetings.watchtowerReaderId,
			prayerId: weekendMeetings.prayerUserId,
			watchtowerFirst: weekendMeetings.watchtowerFirst,
			watchtowerTitle: weekendMeetings.watchtowerTitle,
			watchtowerSong: weekendMeetings.watchtowerSongNumber,
			closingSong: weekendMeetings.closingSongNumber,
			speakerName: sql<string | null>`coalesce(${users.fullName}, ${speakers.fullName})`,
			speakerCongregation: speakerCongregations.name,
			outlineNumber: publicTalkOutlines.number,
			outlineTitle: publicTalkOutlines.title,
			songNumber: songs.number,
		})
		.from(weekendMeetings)
		.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
		.leftJoin(users, eq(users.id, speakers.userId))
		.leftJoin(speakerCongregations, eq(speakerCongregations.id, speakers.congregationId))
		.leftJoin(publicTalkOutlines, eq(publicTalkOutlines.id, weekendMeetings.talkOutlineId))
		.leftJoin(
			speakerOutlines,
			and(eq(speakerOutlines.speakerId, weekendMeetings.speakerId), eq(speakerOutlines.outlineId, weekendMeetings.talkOutlineId)),
		)
		.leftJoin(songs, eq(songs.number, speakerOutlines.songNumber))
		.where(and(gte(weekendMeetings.meetingDate, from), lte(weekendMeetings.meetingDate, to)))
		.orderBy(asc(weekendMeetings.meetingDate));
	const names = await nameMap(db, meetings.flatMap((m) => [m.chairmanUserId, m.conductorId, m.readerId, m.prayerId]));
	const get = (id: string | null) => (id ? (names.get(id) ?? null) : null);
	return meetings.map((m) => ({
		id: m.id,
		date: m.date,
		status: m.status,
		chairman: get(m.chairmanUserId),
		speaker: m.speakerName,
		speakerCongregation: m.speakerCongregation,
		talk: m.outlineNumber != null ? `${m.outlineNumber}. ${m.outlineTitle ?? ""}`.trim() : null,
		talkTitle: m.outlineTitle ?? null,
		talkSong: m.songNumber ?? null,
		watchtowerFirst: m.watchtowerFirst,
		watchtowerTitle: m.watchtowerTitle ?? null,
		watchtowerSong: m.watchtowerSong ?? null,
		closingSong: m.closingSong ?? null,
		conductor: get(m.conductorId),
		reader: get(m.readerId),
		prayer: get(m.prayerId),
	}));
}

export interface OperationalRow {
	task: string;
	person: string | null;
	position: string | null;
}

/** Tareas operativas de una reunión (solo lectura: no siembra puestos). Las tareas
 * sin fila aparecen igual, sin asignar. */
export async function loadOperational(
	db: Database,
	meetingType: "midweek" | "weekend",
	meetingId: string,
): Promise<OperationalRow[]> {
	const tasks = await db
		.select({ id: privileges.id, name: privileges.name })
		.from(privileges)
		.where(and(eq(privileges.category, "operational"), ne(privileges.id, PRIVILEGE_IDS.OPERATIONAL_ACCESS)))
		.orderBy(asc(privileges.name));
	const rows = await db
		.select({
			privilegeId: operationalSchedules.privilegeId,
			position: operationalSchedules.position,
			person: users.fullName,
		})
		.from(operationalSchedules)
		.leftJoin(users, eq(users.id, operationalSchedules.assignedUserId))
		.where(and(eq(operationalSchedules.meetingType, meetingType), eq(operationalSchedules.meetingId, meetingId)));

	const out: OperationalRow[] = [];
	for (const t of tasks) {
		const mine = rows.filter((r) => r.privilegeId === t.id);
		if (mine.length === 0) out.push({ task: t.name, person: null, position: null });
		for (const r of mine) out.push({ task: t.name, person: r.person, position: r.position });
	}
	return out;
}
