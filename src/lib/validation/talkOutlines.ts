import { z } from "zod";

export const createTalkOutlineSchema = z.object({
	number: z.number().int().positive(),
	category: z.string().min(1),
	title: z.string().min(1),
});

export const updateTalkOutlineSchema = z.object({
	number: z.number().int().positive().optional(),
	category: z.string().min(1).optional(),
	title: z.string().min(1).optional(),
	active: z.boolean().optional(),
});
