import { z } from "zod";

export const createFieldServiceGroupSchema = z.object({
	name: z.string().min(1),
	overseerUserId: z.string().uuid().nullable().optional(),
	assistantUserId: z.string().uuid().nullable().optional(),
	regularMeetingPlace: z.string().nullable().optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.nullable()
		.optional(),
});

export const updateFieldServiceGroupSchema = createFieldServiceGroupSchema.partial().extend({
	active: z.boolean().optional(),
});
