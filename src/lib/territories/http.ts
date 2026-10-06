import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { TerritoryFailure, type TerritoryError } from "./service";

const STATUS: Record<TerritoryError, number> = {
	territory_not_found: 404,
	assignment_not_found: 404,
	assignee_invalid: 400,
	not_assignee: 403,
	already_resolved: 409,
	not_assigned: 409,
	number_taken: 409,
	map_not_allowed: 400,
};

/** Respuesta de error de las rutas de territorios: las fallas esperadas
 * (TerritoryFailure) llevan su código; el resto sigue el manejo común. */
export function territoryErrorResponse(error: unknown): NextResponse {
	if (error instanceof TerritoryFailure) {
		return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
	}
	return errorResponse(error);
}

export function invalidBody(error: { flatten: () => unknown }): NextResponse {
	return NextResponse.json({ error: "invalid_body", details: error.flatten() }, { status: 400 });
}
