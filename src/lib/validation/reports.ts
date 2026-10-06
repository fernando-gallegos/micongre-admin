import { z } from "zod";

export const upsertS4ReportSchema = z.object({
	userId: z.string().uuid(),
	periodYear: z.number().int().min(2000),
	periodMonth: z.number().int().min(1).max(12),
	participatedInMinistry: z.boolean().default(true),
	isAuxiliaryPioneerThisMonth: z.boolean().default(false),
	hours: z.number().nonnegative().nullable().optional(),
	projectHours: z.number().nonnegative().nullable().optional(),
	bibleStudiesCount: z.number().int().nonnegative().default(0),
	creditHoursNote: z.string().nullable().optional(),
	comments: z.string().nullable().optional(),
});

export const upsertAttendanceSchema = z.object({
	meetingType: z.enum(["midweek", "weekend"]),
	meetingId: z.string().min(1),
	meetingDate: z.string().min(1),
	inPersonCount: z.number().int().nonnegative(),
	zoomCount: z.number().int().nonnegative().default(0),
});

// Edición retroactiva desde la S-21: a diferencia del envío S-4 (que deduce
// precursor auxiliar y horas del nombramiento de HOY), aquí quien edita
// indica los valores reales de ese mes pasado.
export const s21ReportSchema = z.object({
	periodYear: z.number().int().min(2000).max(2100),
	periodMonth: z.number().int().min(1).max(12),
	participatedInMinistry: z.boolean(),
	isAuxiliaryPioneerThisMonth: z.boolean(),
	hours: z.number().min(0).max(744).nullable().optional(),
	projectHours: z.number().min(0).max(744).nullable().optional(),
	bibleStudiesCount: z.number().int().min(0).max(999),
	comments: z.string().trim().max(500).nullable().optional(),
});

export const s21PeriodSchema = z.object({
	periodYear: z.number().int().min(2000).max(2100),
	periodMonth: z.number().int().min(1).max(12),
});
