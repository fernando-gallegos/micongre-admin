import { asc, eq, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { JwHubError, extractHubUrl, fetchHubCongregation, hubCongregationColumns, parseHubUrl } from "@/lib/jw/hub";
import { createSpeakerCongregationSchema, importSpeakerCongregationSchema } from "@/lib/validation/speakers";

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const { searchParams } = new URL(request.url);
		const search = searchParams.get("search")?.trim();

		const db = getDb();
		const rows = await db
			.select()
			.from(speakerCongregations)
			.where(search ? like(speakerCongregations.name, `%${search}%`) : undefined)
			.orderBy(asc(speakerCongregations.name));

		return NextResponse.json({ items: rows });
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const body = await request.json().catch(() => null);
		const db = getDb();

		// Alta desde un enlace del JW Hub: si la congregación ya existe (mismo
		// evento del Hub, o mismo nombre cargado antes a mano) se reutiliza y se
		// le actualizan los datos; si no, se crea.
		const imported = importSpeakerCongregationSchema.safeParse(body);
		if (imported.success) {
			// Puede venir el enlace solo o el texto completo que copia JW.ORG: se guarda solo el enlace limpio.
			const { locationId, eventId } = parseHubUrl(imported.data.url);
			const url = extractHubUrl(imported.data.url);
			const hub = await fetchHubCongregation(locationId, eventId);
			const columns = hubCongregationColumns(hub, url);

			const [byEvent] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.jwEventId, hub.jwEventId));
			const [existing] = byEvent ? [byEvent] : await db.select().from(speakerCongregations).where(eq(speakerCongregations.name, hub.name));

			if (existing) {
				const [congregation] = await db
					.update(speakerCongregations)
					.set(columns)
					.where(eq(speakerCongregations.id, existing.id))
					.returning();
				return NextResponse.json({ congregation, created: false });
			}

			const [congregation] = await db.insert(speakerCongregations).values(columns).returning();
			return NextResponse.json({ congregation, created: true }, { status: 201 });
		}

		const parsed = createSpeakerCongregationSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const [congregation] = await db.insert(speakerCongregations).values(parsed.data).returning();

		return NextResponse.json({ congregation }, { status: 201 });
	} catch (error) {
		if (error instanceof JwHubError) {
			return NextResponse.json({ error: error.code }, { status: error.code === "unavailable" ? 502 : 400 });
		}
		return errorResponse(error);
	}
}
