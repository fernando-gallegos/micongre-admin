import { NextResponse } from "next/server";
import type { SetupFailure } from "./service";

const STATUS_BY_ERROR: Record<SetupFailure["error"], number> = {
	already_configured: 409,
	database_not_empty: 409,
	username_taken: 409,
	invalid_hourglass: 400,
	import_failed: 500,
	invalid_backup: 400,
	invalid_nws: 400,
	restore_failed: 500,
};

export function setupFailureResponse(failure: SetupFailure & { message?: string }) {
	return NextResponse.json(
		{ error: failure.error, ...(failure.message ? { message: failure.message } : {}) },
		{ status: STATUS_BY_ERROR[failure.error] },
	);
}
