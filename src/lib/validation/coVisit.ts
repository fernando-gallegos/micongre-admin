import { z } from "zod";
import { CO_RECOMMENDATION_DECISIONS, CO_RECOMMENDATION_OFFICES } from "@/db/schema";

const hospitalityDaySchema = z.object({
	lunch: z.string().nullable().optional(),
	dinner: z.string().nullable().optional(),
});

export const hospitalityScheduleSchema = z.record(z.string(), hospitalityDaySchema);

export const createVisitSchema = z.object({
	circuitOverseerName: z.string().min(1),
	startDate: z.string().min(1),
	endDate: z.string().min(1),
	midweekMeetingModifications: z.boolean().default(false),
	hospitalitySchedule: hospitalityScheduleSchema.optional().nullable(),
	notes: z.string().optional().nullable(),
});

export const updateVisitSchema = createVisitSchema.partial();

// Mismo patrón "conjunto completo deseado, diff en el servidor" que
// setAppointmentsSchema/setPrivilegesSchema (src/lib/validation/appointments.ts).
export const setAuxiliaryPioneersSchema = z.object({
	userIds: z.array(z.string().uuid()),
});

// Checklist fijo de 1 Tim. 3 / Tito 1 — no exhaustivo del texto bíblico, un
// resumen práctico para que el cuerpo de ancianos marque antes de recomendar.
export const biblicalQualificationsSchema = z.object({
	husbandOfOneWife: z.boolean().default(false),
	managesHouseholdWell: z.boolean().default(false),
	notARecentConvert: z.boolean().default(false),
	goodReputationOutsideCongregation: z.boolean().default(false),
	temperateAndSoundInMind: z.boolean().default(false),
	orderlyAndHospitable: z.boolean().default(false),
	notViolentButReasonable: z.boolean().default(false),
	notAddictedToWineNotPugnacious: z.boolean().default(false),
	notLoverOfMoney: z.boolean().default(false),
	skillfulTeacher: z.boolean().default(false),
});

export const createRecommendationSchema = z.object({
	visitId: z.string().uuid().optional().nullable(),
	candidateUserId: z.string().uuid(),
	recommendedOffice: z.enum(CO_RECOMMENDATION_OFFICES),
	isFirstTime: z.boolean().default(false),
	isReappointment: z.boolean().default(false),
	removalDate: z.string().optional().nullable(),
	removalReason: z.string().optional().nullable(),
	previousCongregationLetterAttached: z.boolean().default(false),
	biblicalQualificationsCheck: biblicalQualificationsSchema.optional().nullable(),
	threeMandatoryQuestionsConfirmed: z.boolean().default(false),
});

export const updateRecommendationSchema = createRecommendationSchema.partial();

// Única escritura permitida al SC en el paquete S-62 — ver
// assertCanAccessCoVisitDossier en src/lib/rbac/guards.ts.
export const updateRecommendationDecisionSchema = z.object({
	circuitOverseerDecision: z.enum(CO_RECOMMENDATION_DECISIONS),
	announcementDate: z.string().optional().nullable(),
});
