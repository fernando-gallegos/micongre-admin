import { z } from "zod";
import { MEETING_TYPES } from "@/db/schema";

export const createOperationalSlotSchema = z.object({
	meetingType: z.enum(MEETING_TYPES),
	meetingId: z.string().min(1),
	privilegeId: z.string().min(1),
	position: z.string().optional().nullable(),
});

export const assignOperationalSlotSchema = z.object({
	assignedUserId: z.string().uuid().nullable(),
});

export const notifyOperationalSchema = z.object({
	meetingType: z.enum(MEETING_TYPES),
	meetingId: z.string().min(1),
});
