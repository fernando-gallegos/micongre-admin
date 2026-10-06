import { z } from "zod";
import { REPORT_THEME_IDS } from "@/lib/export/themes";

const meetingScheduleEntry = z.object({ day: z.string().min(1), time: z.string().min(1) });

export const meetingSchedulesSchema = z.object({
	midweek: meetingScheduleEntry.nullable().optional(),
	weekend: meetingScheduleEntry.nullable().optional(),
});

const linkUrl = z
	.string()
	.trim()
	.max(500)
	.refine((v) => v === "" || /^https?:\/\//i.test(v), "Debe iniciar con http:// o https://")
	.optional()
	.nullable();
const linkColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable();

export const updateCongregationSchema = z.object({
	congregationNumber: z.string().optional().nullable(),
	name: z.string().min(1).optional(),
	circuitId: z.string().optional().nullable(),
	language: z.string().optional().nullable(),
	kingdomHallAddress: z.string().optional().nullable(),
	isContactCongregation: z.boolean().optional(),
	// cobeUserId/secretaryUserId/serviceOverseerUserId ya no se editan aquí —
	// se derivan de los nombramientos (ver PUT /api/publishers/[id]/appointments).
	meetingSchedules: meetingSchedulesSchema.optional().nullable(),
	preachingTime: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.optional()
		.nullable(),
	skipOpeningPrayer: z.boolean().optional(),
	reminderHour: z.number().int().min(0).max(23).optional().nullable(),
	linkCongregationUrl: linkUrl,
	linkCongregationColor: linkColor,
	linkAppointedUrl: linkUrl,
	linkAppointedColor: linkColor,
	linkEldersUrl: linkUrl,
	linkEldersColor: linkColor,
	zoomUrl: linkUrl,
	reportTheme: z.enum(REPORT_THEME_IDS).optional().nullable(),
	monthlyContributionCents: z.number().int().nonnegative().optional().nullable(),
	maxBalanceApprovedCents: z.number().int().nonnegative().optional().nullable(),
	maxSinglePaymentLimitCents: z.number().int().nonnegative().optional().nullable(),
});

export type UpdateCongregationInput = z.infer<typeof updateCongregationSchema>;
