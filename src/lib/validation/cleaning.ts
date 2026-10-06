import { z } from "zod";
import { MEETING_TYPES } from "@/db/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Identifica la tarea sobre la que se actúa (ver CleaningTaskRef).
export const cleaningRefSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("ligera"), meetingType: z.enum(MEETING_TYPES), meetingId: z.string().min(1) }),
	z.object({ kind: z.literal("profunda"), weekStart: isoDate }),
	z.object({ kind: z.literal("a_fondo"), taskId: z.string().min(1) }),
]);

export const addAssigneeSchema = z.object({
	ref: cleaningRefSchema,
	assignee: z.discriminatedUnion("type", [
		z.object({ type: z.literal("group"), groupId: z.string().min(1) }),
		z.object({ type: z.literal("own_congregation") }),
		z.object({ type: z.literal("congregation"), congregationId: z.string().min(1) }),
	]),
});

export const completeCleaningSchema = z.object({ ref: cleaningRefSchema, done: z.boolean() });

export const createThoroughSchema = z.object({
	taskDate: isoDate,
	notes: z.string().trim().max(500).nullish(),
});

export const createHallCongregationSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const updateHallCongregationSchema = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	active: z.boolean().optional(),
});
