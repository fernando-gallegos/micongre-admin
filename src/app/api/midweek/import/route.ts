import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessMidweekModule } from "@/lib/rbac/guards";
import { chunked } from "@/lib/cleaning/meetings";
import { addDays, issueCodeForWeek, parseISODate, toISODate, weekStartsOfMonth } from "@/lib/mwb/dates";
import { fetchMwbEpub, MwbFetchError } from "@/lib/mwb/fetchEpub";
import { parseWeekPrograms } from "@/lib/mwb/parseProgram";
import { programRows, ROWS_PER_INSERT, type ProgramRow } from "@/lib/mwb/programRows";
import { importMidweekProgramSchema } from "@/lib/validation/midweek";
import { ensureSongsCatalog } from "@/lib/songs/catalog";

type WeekAction = "created" | "replaced" | "updated" | "not_found";

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
		// Las canciones de la guía se guardan por número; el título sale del catálogo (se baja solo si falta).
		await ensureSongsCatalog(getDb());

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
