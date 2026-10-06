import { NextResponse } from "next/server";
import { RbacError } from "@/lib/rbac/errors";

export function errorResponse(error: unknown): NextResponse {
	if (error instanceof RbacError) {
		return NextResponse.json({ error: error.message }, { status: 403 });
	}
	console.error(error);
	return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
