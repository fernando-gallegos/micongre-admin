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
	invalid_departure: 400,
	departure_locked: 409,
	captain_invalid: 400,
};

export function preachingErrorResponse(error: unknown): NextResponse {
	if (error instanceof PreachingFailure) return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
	return errorResponse(error);
}

export const sessionSchema = z.object({
	date: z.string().min(1),
	time: z.string().min(1),
	note: z.string().trim().max(500).optional().nullable(),
	recurring: z.boolean().optional().default(false),
	territoryIds: z.array(z.string().min(1)).min(1),
	departures: z.record(z.string(), z.string().min(1).max(64).nullable()).optional(),
	/** Flujo 2: el capitán de la salida (el fijo del día o un suplente); al guardar se le asigna el territorio. */
	captainUserId: z.string().min(1).nullable().optional(),
	targets: z.object({
		congregation: z.boolean().default(false),
		groupIds: z.array(z.string().min(1)).default([]),
		userIds: z.array(z.string().min(1)).default([]),
	}),
});

export function toInput(parsed: z.infer<typeof sessionSchema>): SessionInput {
	return { date: parsed.date, time: parsed.time, note: parsed.note?.trim() || null, recurring: parsed.recurring, territoryIds: parsed.territoryIds, departures: parsed.departures, targets: parsed.targets, captainUserId: parsed.captainUserId ?? null };
}
