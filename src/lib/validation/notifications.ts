import { z } from "zod";

export const createNotificationSchema = z.discriminatedUnion("scope", [
	z.object({
		scope: z.literal("publisher"),
		message: z.string().min(1),
		expiresAt: z.string().min(1),
		recipientUserIds: z.array(z.string().uuid()).min(1),
	}),
	z.object({
		scope: z.literal("group"),
		message: z.string().min(1),
		expiresAt: z.string().min(1),
	}),
	z.object({
		scope: z.literal("congregation"),
		message: z.string().min(1),
		expiresAt: z.string().min(1),
	}),
]);
