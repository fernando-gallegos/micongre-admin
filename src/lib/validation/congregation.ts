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
// Dirección pública: solo el origen (https://host); se normaliza al guardar y no puede ser la URL interna del Worker (workers.dev).
const publicUrl = z
	.string()
	.trim()
	.max(200)
	.refine((v) => {
		try {
			const u = new URL(v);
			return (u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost")) && !u.hostname.endsWith(".workers.dev");
		} catch {
			return false;
		}
	}, "Escribe una dirección https:// válida que no sea la de workers.dev")
	.transform((v) => new URL(v).origin)
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
	publicUrl,
	preachingTime: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.optional()
		.nullable(),
	skipOpeningPrayer: z.boolean().optional(),
	animationsEnabled: z.boolean().optional(),
	reminderHour: z.number().int().min(0).max(23).optional().nullable(),
	linkCongregationUrl: linkUrl,
	linkCongregationColor: linkColor,
	linkAppointedUrl: linkUrl,
	linkAppointedColor: linkColor,
	linkEldersUrl: linkUrl,
	linkEldersColor: linkColor,
	linkPioneersUrl: linkUrl,
	linkPioneersColor: linkColor,
	linkMinisterialUrl: linkUrl,
	linkMinisterialColor: linkColor,
	linkCommitteeUrl: linkUrl,
	linkCommitteeColor: linkColor,
	zoomUrl: linkUrl,
	reportTheme: z.enum(REPORT_THEME_IDS).optional().nullable(),
	monthlyContributionCents: z.number().int().nonnegative().optional().nullable(),
	maxBalanceApprovedCents: z.number().int().nonnegative().optional().nullable(),
	maxSinglePaymentLimitCents: z.number().int().nonnegative().optional().nullable(),
});

export type UpdateCongregationInput = z.infer<typeof updateCongregationSchema>;
