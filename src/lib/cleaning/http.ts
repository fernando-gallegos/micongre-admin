import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { CleaningFailure, type CleaningError } from "./tasks";

const STATUS: Record<CleaningError, number> = {
	meeting_not_found: 404,
	task_not_found: 404,
	group_not_found: 404,
	congregation_not_found: 404,
	invalid_week: 400,
	meeting_cancelled: 409,
	meeting_past: 409,
	task_past: 409,
	nothing_to_notify: 409,
	empty_recipients: 409,
};

/** Respuesta de error de las rutas de limpieza: las fallas esperadas
 * (CleaningFailure) llevan su código; el resto sigue el manejo común. */
export function cleaningErrorResponse(error: unknown): NextResponse {
	if (error instanceof CleaningFailure) {
		return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
	}
	return errorResponse(error);
}

export function invalidBody(error: { flatten: () => unknown }): NextResponse {
	return NextResponse.json({ error: "invalid_body", details: error.flatten() }, { status: 400 });
}
