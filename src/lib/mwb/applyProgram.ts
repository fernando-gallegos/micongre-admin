import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/db/client";
import { midweekAssignments, midweekMeetings } from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { mwbLinkFields, programRows, ROWS_PER_INSERT, type ProgramRow } from "@/lib/mwb/programRows";
import type { ParsedProgram } from "@/lib/mwb/types";

/** Lo que importa de una parte ya guardada para compararla con la guía. */
export interface ExistingPart {
	id: string;
	sectionType: string;
	sectionTitle: string | null;
	description: string | null;
	partNumber: number | null;
	durationMinutes: number | null;
	sequenceOrder: number;
	mainAssigneeId: string | null;
	assistantAssigneeId: string | null;
}

export interface ProgramMerge {
	/** Partes que siguen en la guía: solo cambian sus datos (nunca quién está asignado). */
	updates: { id: string; set: Pick<ProgramRow, "sectionTitle" | "description" | "partNumber" | "durationMinutes" | "sequenceOrder"> }[];
	/** Partes nuevas de la guía. */
	inserts: ProgramRow[];
	/** Partes que ya no están en la guía y no tienen a nadie: se borran. */
	deletes: string[];
}

// Clave de "casilla": las filas de un mismo tipo se emparejan por posición; el estudio bíblico se separa por conductor/lector.
function slotKey(sectionType: string, sectionTitle: string | null): string {
	return sectionType === "cbs" ? `cbs:${sectionTitle}` : sectionType;
}

const hasAssignee = (p: ExistingPart) => !!(p.mainAssigneeId || p.assistantAssigneeId);

/**
 * Cómo dejar una reunión al día con la guía sin tocar las asignaciones: cada parte guardada se empareja con la de la guía (por tipo y
 * posición) y solo se actualizan sus datos; las nuevas se agregan; las que ya no están se borran solo si nadie las tiene asignadas (si
 * alguien las tiene, se conservan al final del programa). Solo devuelve los cambios reales (correrlo dos veces no cambia nada).
 */
export function planProgramMerge(current: ExistingPart[], rows: ProgramRow[]): ProgramMerge {
	const out: ProgramMerge = { updates: [], inserts: [], deletes: [] };
	const newBySlot = new Map<string, ProgramRow[]>();
	for (const row of rows) {
		const key = slotKey(row.sectionType, row.sectionTitle);
		newBySlot.set(key, [...(newBySlot.get(key) ?? []), row]);
	}
	const oldBySlot = new Map<string, ExistingPart[]>();
	for (const a of [...current].sort((x, y) => x.sequenceOrder - y.sequenceOrder)) {
		const key = slotKey(a.sectionType, a.sectionTitle);
		oldBySlot.set(key, [...(oldBySlot.get(key) ?? []), a]);
	}

	let extraOrder = rows.length;
	for (const key of new Set([...newBySlot.keys(), ...oldBySlot.keys()])) {
		const fresh = newBySlot.get(key) ?? [];
		const old = oldBySlot.get(key) ?? [];
		fresh.forEach((row, i) => {
			const match = old[i];
			if (!match) {
				out.inserts.push(row);
				return;
			}
			const set = {
				sectionTitle: row.sectionTitle,
				description: row.description,
				partNumber: row.partNumber,
				durationMinutes: row.durationMinutes,
				sequenceOrder: row.sequenceOrder,
			};
			const changed = (Object.keys(set) as (keyof typeof set)[]).some((k) => (match[k] ?? null) !== (set[k] ?? null));
			if (changed) out.updates.push({ id: match.id, set });
		});
		for (const leftover of old.slice(fresh.length)) {
			if (!hasAssignee(leftover)) {
				out.deletes.push(leftover.id);
				continue;
			}
			// Asignada y ya no está en la guía: se conserva (con su asignado), al final.
			extraOrder++;
			if (leftover.sequenceOrder !== extraOrder) {
				out.updates.push({
					id: leftover.id,
					set: {
						sectionTitle: leftover.sectionTitle,
						description: leftover.description,
						partNumber: leftover.partNumber,
						durationMinutes: leftover.durationMinutes,
						sequenceOrder: extraOrder,
					},
				});
			}
		}
	}
	return out;
}

interface MeetingRow {
	id: string;
	weekLabel: string | null;
	openingSongNumber: number | null;
	closingSongNumber: number | null;
	middleSongNumber: number | null;
	studyLessonReference: string | null;
	mwbDocId: number | null;
	mwbPars: string | null;
}

/**
 * Deja una reunión de entre semana igual que la guía (encabezado, canciones, estudio, enlaces a JW Library y partes) sin cambiar a nadie
 * de su asignación. Devuelve si cambió algo.
 */
export async function applyProgramToMeeting(db: Database, meeting: MeetingRow, current: ExistingPart[], program: ParsedProgram): Promise<boolean> {
	const fields = {
		weekLabel: program.weekLabel,
		openingSongNumber: program.openingSongNumber,
		closingSongNumber: program.closingSongNumber,
		middleSongNumber: program.middleSongNumber,
		studyLessonReference: program.cbs.title,
		...mwbLinkFields(program),
	};
	const statements: BatchItem<"sqlite">[] = [];
	if ((Object.keys(fields) as (keyof typeof fields)[]).some((k) => (meeting[k] ?? null) !== (fields[k] ?? null))) {
		statements.push(db.update(midweekMeetings).set(fields).where(eq(midweekMeetings.id, meeting.id)));
	}
	const plan = planProgramMerge(current, programRows(program));
	for (const u of plan.updates) statements.push(db.update(midweekAssignments).set(u.set).where(eq(midweekAssignments.id, u.id)));
	for (const id of plan.deletes) statements.push(db.delete(midweekAssignments).where(eq(midweekAssignments.id, id)));
	for (const chunk of chunked(plan.inserts, ROWS_PER_INSERT)) {
		statements.push(db.insert(midweekAssignments).values(chunk.map((row) => ({ ...row, meetingId: meeting.id }))));
	}
	if (statements.length === 0) return false;
	await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
	return true;
}
