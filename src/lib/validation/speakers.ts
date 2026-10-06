import { z } from "zod";

export const createSpeakerSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("local"),
		userId: z.string().uuid(),
		outlineIds: z.array(z.string().min(1)).default([]),
	}),
	z.object({
		kind: z.literal("visiting"),
		fullName: z.string().min(1),
		phone: z.string().nullable().optional(),
		congregationId: z.string().min(1).nullable().optional(),
		outlineIds: z.array(z.string().min(1)).default([]),
	}),
]);

export const updateSpeakerSchema = z.object({
	fullName: z.string().min(1).optional(),
	phone: z.string().nullable().optional(),
	congregationId: z.string().min(1).nullable().optional(),
	notes: z.string().nullable().optional(),
	active: z.boolean().optional(),
	outlineIds: z.array(z.string().min(1)).optional(),
});

export const createSpeakerCongregationSchema = z.object({
	name: z.string().min(1),
	phone: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
});

export const updateSpeakerCongregationSchema = createSpeakerCongregationSchema.partial().extend({
	forkUrl: z.string().nullable().optional(),
});

// Alta desde el enlace del JW Hub (la UI ya no pide el nombre a mano).
export const importSpeakerCongregationSchema = z.object({
	url: z.string().min(1),
});
