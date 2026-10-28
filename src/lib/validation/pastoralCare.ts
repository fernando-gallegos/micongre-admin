import { z } from "zod";
import { ASSISTANCE_STATUSES, ASSISTANCE_TYPES } from "@/db/schema";

const RESOLVED_VISIT_REQUEST_STATUSES = ["completed", "cancelled", "postponed"] as const;

export const createVisitSchema = z.object({
	publisherId: z.string().uuid(),
	dateVisited: z.string().min(1),
	eldersAssigned: z.array(z.string().uuid()).min(1),
	scripturesConsidered: z.string().optional().nullable(),
	followUpNeeded: z.boolean().default(false),
	confidentialNotes: z.string().optional().nullable(),
});

export const updateVisitSchema = createVisitSchema.partial();

export const updateVisitVisibilitySchema = z.object({
	visibleToAllElders: z.boolean(),
});

export const createFlagSchema = z.object({
	publisherId: z.string().uuid(),
	reason: z.string().min(1),
});

export const createAssistanceRequestSchema = z.object({
	publisherId: z.string().uuid(),
	type: z.enum(ASSISTANCE_TYPES),
	requestDate: z.string().min(1),
	assignedElders: z.array(z.string().uuid()).optional().nullable(),
});

export const updateAssistanceRequestSchema = z.object({
	status: z.enum(ASSISTANCE_STATUSES).optional(),
	assignedElders: z.array(z.string().uuid()).optional().nullable(),
	resolutionSummary: z.string().optional().nullable(),
});

export const createVisitRequestSchema = z.object({
	requestedDate: z.string().min(1),
	notes: z.string().optional().nullable(),
});

export const assignVisitRequestSchema = z.object({
	assignedElders: z.array(z.string().uuid()).length(2, "Se deben asignar exactamente 2 ancianos."),
});

export const updateVisitRequestStatusSchema = z.object({
	status: z.enum(RESOLVED_VISIT_REQUEST_STATUSES),
	// Al postergar: la nueva fecha (se crea otro pastoreo con los mismos ancianos) y el comentario que lleva el nuevo.
	newDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	notes: z.string().trim().max(1000).optional().nullable(),
});
