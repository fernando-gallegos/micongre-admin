import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/errors";
import { PreachingFailure, type PreachingError, type SessionInput } from "./service";

const STATUS: Record<PreachingError, number> = {
	not_found: 404,
	invalid_date: 400,
	invalid_time: 400,
	no_territories: 400,
	territory_not_assigned: 400,
	mixed_kinds: 400,
	invalid_targets: 400,
};

export function preachingErrorResponse(error: unknown): NextResponse {
	if (error instanceof PreachingFailure) return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
	return errorResponse(error);
}

export const sessionSchema = z.object({
	date: z.string().min(1),
	time: z.string().min(1),
	note: z.string().trim().max(500).optional().nullable(),
	territoryIds: z.array(z.string().min(1)).min(1),
	targets: z.object({
		congregation: z.boolean().default(false),
		groupIds: z.array(z.string().min(1)).default([]),
		userIds: z.array(z.string().min(1)).default([]),
	}),
});

export function toInput(parsed: z.infer<typeof sessionSchema>): SessionInput {
	return { date: parsed.date, time: parsed.time, note: parsed.note?.trim() || null, territoryIds: parsed.territoryIds, targets: parsed.targets };
}
