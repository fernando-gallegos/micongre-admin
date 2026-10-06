import { z } from "zod";
import { CONGREGATION_STATUS_INPUTS, GENDERS, SYSTEM_ROLES, THEOCRATIC_STATUSES } from "@/db/schema";

export const createPublisherSchema = z.object({
	fullName: z.string().min(2),
	gender: z.enum(GENDERS),
	congregationStatus: z.enum(CONGREGATION_STATUS_INPUTS).default("active"),
	theocraticStatus: z.enum(THEOCRATIC_STATUSES),
	birthDate: z.string().optional().nullable(),
	baptismDate: z.string().optional().nullable(),
	phone: z.string().optional().nullable(),
	email: z.string().email().optional().nullable(),
	emergencyContactName: z.string().optional().nullable(),
	emergencyContactPhone: z.string().optional().nullable(),
	emergencyContactRelation: z.string().optional().nullable(),
	isMinor: z.boolean().default(false),
	hasDpaCard: z.boolean().default(false),
	isEligibleForReducedReport: z.boolean().default(false),
	guardianUserId: z.string().uuid().optional().nullable(),
	householdId: z.string().uuid().optional().nullable(),
	fieldServiceGroupId: z.string().uuid().optional().nullable(),
});

// El admin puede editar todos los datos de un publicador, incluyendo rol de
// sistema y si su cuenta está habilitada — a diferencia de account_status,
// que lo gobierna el flujo de activación y no se toca desde aquí.
export const updatePublisherSchema = createPublisherSchema.partial().extend({
	systemRole: z.enum(SYSTEM_ROLES).optional(),
	active: z.boolean().optional(),
	// Solo tiene efecto real cuando systemRole es "admin" — ver PATCH /api/publishers/[id].
	isHiddenAdmin: z.boolean().optional(),
});

export type CreatePublisherInput = z.infer<typeof createPublisherSchema>;
export type UpdatePublisherInput = z.infer<typeof updatePublisherSchema>;
