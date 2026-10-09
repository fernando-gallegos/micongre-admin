import type { MIDWEEK_SECTION_TYPES } from "@/db/schema";
import type { ParsedProgram } from "@/lib/mwb/types";
import { PRIVILEGE_IDS } from "@/lib/rbac/roles";

// D1 limita a 100 parámetros por consulta; cada fila usa ~9.
export const ROWS_PER_INSERT = 8;

type SectionType = (typeof MIDWEEK_SECTION_TYPES)[number];

export interface ProgramRow {
	sectionType: SectionType;
	sectionTitle: string | null;
	description: string | null;
	partNumber: number | null;
	sequenceOrder: number;
	durationMinutes: number | null;
	privilegeId: string;
}


// Todas las filas del programa en el orden de la guía: Tesoros, Seamos mejores
// maestros (cantidad variable), Nuestra vida cristiana (1+ partes), estudio
// bíblico (conductor y lector) y oración.
export function programRows(program: ParsedProgram): ProgramRow[] {
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

