import { z } from "zod";
import { MIDWEEK_STATUSES } from "@/db/schema";

export const createMidweekMeetingSchema = z.object({
	meetingDate: z.string().min(1),
	weekLabel: z.string().optional().nullable(),
	studyLessonReference: z.string().optional().nullable(),
	openingSongNumber: z.number().int().positive().optional().nullable(),
	hasAuxRoom: z.boolean().default(false),
});

export const updateMidweekMeetingSchema = z.object({
	weekLabel: z.string().optional().nullable(),
	status: z.enum(MIDWEEK_STATUSES).optional(),
	chairmanUserId: z.string().uuid().optional().nullable(),
	openingSongNumber: z.number().int().positive().optional().nullable(),
	closingSongNumber: z.number().int().positive().optional().nullable(),
	middleSongNumber: z.number().int().positive().optional().nullable(),
	openingPrayerUserId: z.string().uuid().optional().nullable(),
	studyLessonReference: z.string().optional().nullable(),
	hasAuxRoom: z.boolean().optional(),
	notes: z.string().optional().nullable(),
});

export const importMidweekProgramSchema = z.object({
	meetingDate: z.string().min(1),
	weekStart: z.string().min(1),
	overwrite: z.boolean().optional().default(false),
});

// "student_assignment" (Seamos mejores maestros, catálogo fijo de 6 tipos)
// o "living_custom" (Nuestra vida cristiana, título libre) — las únicas dos
// secciones de cantidad variable, agregadas a mano desde el constructor
// semanal. `position` es 1-based dentro del grupo de esa sección; sin valor
// se agrega al final (comportamiento de siempre).
export const createAssignmentSchema = z.object({
	sectionType: z.enum(["student_assignment", "living_custom"]).default("student_assignment"),
	sectionTitle: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	position: z.number().int().positive().optional(),
});

export const updateAssignmentSchema = z.object({
	mainAssigneeId: z.string().uuid().nullable().optional(),
	assistantAssigneeId: z.string().uuid().nullable().optional(),
	room: z.enum(["main", "auxiliary"]).optional(),
	sectionTitle: z.string().optional().nullable(),
	description: z.string().optional().nullable(),
	durationMinutes: z.number().int().positive().optional().nullable(),
});
