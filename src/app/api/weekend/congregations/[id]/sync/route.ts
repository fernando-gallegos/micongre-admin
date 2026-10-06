import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { JwHubError, fetchHubCongregation, hubCongregationColumns, parseHubUrl } from "@/lib/jw/hub";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";

// Vuelve a leer del JW Hub los datos de una congregación que ya tiene enlace.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const db = getDb();
		const [current] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, id));
		if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
		if (!current.jwUrl) return NextResponse.json({ error: "no_jw_url" }, { status: 400 });

		const { locationId, eventId } = parseHubUrl(current.jwUrl);
		const hub = await fetchHubCongregation(locationId, eventId);

		// El Hub puede haber renombrado la congregación a un nombre ya usado.
		const [clash] = await db
			.select({ id: speakerCongregations.id })
			.from(speakerCongregations)
			.where(and(eq(speakerCongregations.name, hub.name), ne(speakerCongregations.id, id)));
		if (clash) return NextResponse.json({ error: "name_conflict" }, { status: 409 });

		const [congregation] = await db
			.update(speakerCongregations)
			.set(hubCongregationColumns(hub, current.jwUrl))
			.where(eq(speakerCongregations.id, id))
			.returning();

		return NextResponse.json({ congregation });
	} catch (error) {
		if (error instanceof JwHubError) {
			return NextResponse.json({ error: error.code }, { status: error.code === "unavailable" ? 502 : 400 });
		}
		return errorResponse(error);
	}
}
