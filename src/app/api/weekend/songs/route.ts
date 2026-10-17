import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { songs } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";

export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const items = await getDb().select().from(songs).orderBy(asc(songs.number));
		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}
