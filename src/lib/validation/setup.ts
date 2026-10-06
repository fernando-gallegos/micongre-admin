import { z } from "zod";
import { updateCongregationSchema } from "./congregation";

export const setupCongregationSchema = updateCongregationSchema
	.pick({
		congregationNumber: true,
		circuitId: true,
		language: true,
		kingdomHallAddress: true,
		isContactCongregation: true,
		meetingSchedules: true,
		preachingTime: true,
	})
	.extend({ name: z.string().trim().min(1) });

export const setupAdminSchema = z.object({
	fullName: z.string().trim().min(3).max(120),
	username: z
		.string()
		.trim()
		.min(3)
		.max(50)
		.regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos."),
	password: z.string().min(8).max(200),
});

export type SetupCongregationInput = z.infer<typeof setupCongregationSchema>;
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
