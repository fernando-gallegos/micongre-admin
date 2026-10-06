import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings, MIDWEEK_SECTION_TYPES } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { chunked } from "@/lib/cleaning/meetings";
import { addDays, issueCodeForWeek, parseISODate, toISODate, weekStartsOfMonth } from "@/lib/mwb/dates";
import { fetchMwbEpub, MwbFetchError } from "@/lib/mwb/fetchEpub";
import { parseWeekPrograms } from "@/lib/mwb/parseProgram";
import type { ParsedProgram } from "@/lib/mwb/types";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";
import { importMidweekProgramSchema } from "@/lib/validation/midweek";

// D1 limita a 100 parámetros por consulta; cada fila usa ~9.
const ROWS_PER_INSERT = 8;

type SectionType = (typeof MIDWEEK_SECTION_TYPES)[number];

interface ProgramRow {
	sectionType: SectionType;
	sectionTitle: string | null;
	description: string | null;
	partNumber: number | null;
	sequenceOrder: number;
	durationMinutes: number | null;
	privilegeId: string;
}

type WeekAction = "created" | "replaced" | "updated" | "not_found";

// Todas las filas del programa en el orden de la guía: Tesoros, Seamos mejores
// maestros (cantidad variable), Nuestra vida cristiana (1+ partes), estudio
// bíblico (conductor y lector) y oración.
function programRows(program: ParsedProgram): ProgramRow[] {
	const rows: ProgramRow[] = [
		{
			sectionType: "treasures_talk",
			sectionTitle: program.treasuresTalk.title,
			description: program.treasuresTalk.description,
			partNumber: program.treasuresTalk.number,
			sequenceOrder: 0,
			durationMinutes: program.treasuresTalk.durationMinutes,
			privilegeId: PRIVILEGE_IDS.TREASURES_TALK,
		},
		{
			sectionType: "spiritual_gems",
			sectionTitle: null,
			description: program.spiritualGems.description,
			partNumber: program.spiritualGems.number,
			sequenceOrder: 0,
			durationMinutes: program.spiritualGems.durationMinutes,
			privilegeId: PRIVILEGE_IDS.SPIRITUAL_GEMS,
		},
		{
			sectionType: "bible_reading",
			sectionTitle: program.bibleReading.title,
			description: null,
			partNumber: program.bibleReading.number,
			sequenceOrder: 0,
			durationMinutes: program.bibleReading.durationMinutes,
			privilegeId: PRIVILEGE_IDS.BIBLE_READING,
		},
		...program.studentParts.map((part) => ({
			sectionType: "student_assignment" as const,
			sectionTitle: part.title,
			description: part.description,
			partNumber: part.number,
			sequenceOrder: 0,
			durationMinutes: part.durationMinutes,
			privilegeId: PRIVILEGE_IDS.STUDENT_ASSIGNMENT,
		})),
	];

	// Solo las partes que trae la guía: si una semana no tiene "Necesidades de la
	// congregación", no se crea esa fila.
	const living = program.livingParts;
	for (const { kind, part } of living) {
		rows.push({
			sectionType: kind,
			sectionTitle: part.title,
			description: part.description,
			partNumber: part.number,
			sequenceOrder: 0,
			durationMinutes: part.durationMinutes,
			privilegeId: kind === "congregation_needs" ? PRIVILEGE_IDS.CONGREGATION_NEEDS : PRIVILEGE_IDS.CHRISTIAN_LIVING,
		});
	}

	rows.push(
		{
			sectionType: "cbs",
			sectionTitle: "Conductor",
			description: null,
			partNumber: program.cbs.number,
			sequenceOrder: 0,
			durationMinutes: program.cbs.durationMinutes,
			privilegeId: PRIVILEGE_IDS.CBS_CONDUCTOR,
		},
		{
			sectionType: "cbs",
			sectionTitle: "Lector",
			description: null,
			partNumber: program.cbs.number,
			sequenceOrder: 0,
			durationMinutes: program.cbs.durationMinutes,
			privilegeId: PRIVILEGE_IDS.CBS_READER,
		},
		{
			sectionType: "prayer",
			sectionTitle: null,
			description: null,
			partNumber: null,
			sequenceOrder: 0,
			durationMinutes: null,
			privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER,
		},
	);

	return rows.map((row, index) => ({ ...row, sequenceOrder: index + 1 }));
}

// Clave de "casilla": las filas de un mismo tipo se emparejan por posición;
// el estudio bíblico se separa por conductor/lector.
function slotKey(sectionType: string, sectionTitle: string | null): string {
	return sectionType === "cbs" ? `cbs:${sectionTitle}` : sectionType;
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessMidweekModule(session);

		const parsed = importMidweekProgramSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const { weekStart } = parsed.data;
		const weekStarts = weekStartsOfMonth(weekStart);

		let epubBytes: ArrayBuffer;
		try {
			epubBytes = await fetchMwbEpub(issueCodeForWeek(weekStart));
		} catch (fetchError) {
			const message =
				fetchError instanceof MwbFetchError ? fetchError.message : "No se pudo contactar a JW.ORG.";
			return NextResponse.json({ error: "upstream_error", message }, { status: 502 });
		}

		const programs = parseWeekPrograms(epubBytes, weekStarts);
		if (programs.size === 0) {
			return NextResponse.json({ error: "week_not_found" }, { status: 404 });
		}

		const db = getDb();
		const monthMeetings = await db
			.select()
			.from(midweekMeetings)
			.where(
				and(
					gte(midweekMeetings.meetingDate, weekStarts[0]),
					lte(midweekMeetings.meetingDate, toISODate(addDays(parseISODate(weekStarts[weekStarts.length - 1]), 6))),
				),
			);
		const meetingIds = monthMeetings.map((m) => m.id);
		const existingAssignments = meetingIds.length
			? await db.select().from(midweekAssignments).where(inArray(midweekAssignments.meetingId, meetingIds))
			: [];

		const weeks: { weekStart: string; weekLabel: string | null; action: WeekAction }[] = [];

		for (const monday of weekStarts) {
			const program = programs.get(monday);
			if (!program) {
				weeks.push({ weekStart: monday, weekLabel: null, action: "not_found" });
				continue;
			}

			const sunday = toISODate(addDays(parseISODate(monday), 6));
			const existing = monthMeetings.find((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
			const rows = programRows(program);
			const meetingFields = {
				weekLabel: program.weekLabel,
				openingSongNumber: program.openingSongNumber,
				closingSongNumber: program.closingSongNumber,
				middleSongNumber: program.middleSongNumber,
				studyLessonReference: program.cbs.title,
			};

			if (!existing) {
				const [meeting] = await db
					.insert(midweekMeetings)
					.values({ meetingDate: monday, ...meetingFields })
					.returning({ id: midweekMeetings.id });
				for (const chunk of chunked(rows, ROWS_PER_INSERT)) {
					await db.insert(midweekAssignments).values(chunk.map((row) => ({ ...row, meetingId: meeting.id })));
				}
				weeks.push({ weekStart: monday, weekLabel: program.weekLabel, action: "created" });
				continue;
			}

			const meetingId = existing.id;
			const current = existingAssignments.filter((a) => a.meetingId === meetingId);
			const hasAssignees =
				existing.chairmanUserId !== null || current.some((a) => a.mainAssigneeId || a.assistantAssigneeId);

			if (!hasAssignees) {
				// Nadie asignado: se reemplaza todo el programa de esa semana.
				const replaceStatements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
					db.update(midweekMeetings).set(meetingFields).where(eq(midweekMeetings.id, meetingId)),
					db.delete(midweekAssignments).where(eq(midweekAssignments.meetingId, meetingId)),
					...chunked(rows, ROWS_PER_INSERT).map((chunk) =>
						db.insert(midweekAssignments).values(chunk.map((row) => ({ ...row, meetingId }))),
					),
				];
				await db.batch(replaceStatements);
				weeks.push({ weekStart: monday, weekLabel: program.weekLabel, action: "replaced" });
				continue;
			}

			// Hay asignados: se actualizan títulos/duraciones/orden de las partes
			// existentes (emparejadas por tipo y posición) y se agregan las nuevas.
			// Las partes que ya no están en la guía se borran junto con su asignado.
			const statements: BatchItem<"sqlite">[] = [
				db.update(midweekMeetings).set(meetingFields).where(eq(midweekMeetings.id, meetingId)),
			];
			const newBySlot = new Map<string, ProgramRow[]>();
			for (const row of rows) {
				const key = slotKey(row.sectionType, row.sectionTitle);
				newBySlot.set(key, [...(newBySlot.get(key) ?? []), row]);
			}
			const oldBySlot = new Map<string, typeof current>();
			for (const a of [...current].sort((x, y) => x.sequenceOrder - y.sequenceOrder)) {
				const key = slotKey(a.sectionType, a.sectionTitle);
				oldBySlot.set(key, [...(oldBySlot.get(key) ?? []), a]);
			}

			const inserts: (ProgramRow & { meetingId: string })[] = [];
			for (const key of new Set([...newBySlot.keys(), ...oldBySlot.keys()])) {
				const fresh = newBySlot.get(key) ?? [];
				const old = oldBySlot.get(key) ?? [];
				fresh.forEach((row, i) => {
					const match = old[i];
					if (match) {
						statements.push(
							db
								.update(midweekAssignments)
								.set({
									sectionTitle: row.sectionTitle,
									description: row.description,
									partNumber: row.partNumber,
									durationMinutes: row.durationMinutes,
									sequenceOrder: row.sequenceOrder,
								})
								.where(eq(midweekAssignments.id, match.id)),
						);
					} else {
						inserts.push({ ...row, meetingId });
					}
				});
				// Lo que ya no está en la guía (partes personalizadas o de relleno) se
				// borra, con su asignado.
				for (const leftover of old.slice(fresh.length)) {
					statements.push(db.delete(midweekAssignments).where(eq(midweekAssignments.id, leftover.id)));
				}
			}
			for (const chunk of chunked(inserts, ROWS_PER_INSERT)) {
				statements.push(db.insert(midweekAssignments).values(chunk));
			}

			await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
			weeks.push({ weekStart: monday, weekLabel: program.weekLabel, action: "updated" });
		}

		return NextResponse.json({ weeks });
	} catch (error) {
		return errorResponse(error);
	}
}
