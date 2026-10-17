import { z } from "zod";

export const createWeekendMeetingSchema = z.object({
	meetingDate: z.string().min(1),
});

export const generateWeekendMonthSchema = z.object({
	weekStart: z.string().min(1),
});

export const updateWeekendMeetingSchema = z.object({
	chairmanUserId: z.string().uuid().nullable().optional(),
	speakerId: z.string().min(1).nullable().optional(),
	talkOutlineId: z.string().min(1).nullable().optional(),
	watchtowerConductorId: z.string().uuid().nullable().optional(),
	watchtowerReaderId: z.string().uuid().nullable().optional(),
	prayerUserId: z.string().uuid().nullable().optional(),
	watchtowerFirst: z.boolean().optional(),
	watchtowerTitle: z.string().nullable().optional(),
	watchtowerSongNumber: z.number().int().positive().nullable().optional(),
	closingSongNumber: z.number().int().positive().nullable().optional(),
	status: z.enum(["scheduled", "cancelled"]).optional(),
	notes: z.string().nullable().optional(),
});
