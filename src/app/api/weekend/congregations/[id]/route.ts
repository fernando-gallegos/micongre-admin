import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { ForkUrlError, normalizeForkUrl } from "@/lib/federation/forkUrl";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { updateSpeakerCongregationSchema } from "@/lib/validation/speakers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const parsed = updateSpeakerCongregationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const { forkUrl, ...rest } = parsed.data;
		const patch: Partial<typeof speakerCongregations.$inferInsert> = rest;

		// URL del fork desplegado: se guarda como origen; vacío la quita.
		if (forkUrl !== undefined) {
			patch.forkUrl = forkUrl?.trim() ? normalizeForkUrl(forkUrl) : null;
			if (patch.forkUrl) {
				const [clash] = await db
					.select({ id: speakerCongregations.id })
					.from(speakerCongregations)
					.where(and(eq(speakerCongregations.forkUrl, patch.forkUrl), ne(speakerCongregations.id, id)));
				if (clash) return NextResponse.json({ error: "fork_url_taken" }, { status: 409 });
			}
		}
		if (patch.name !== undefined) {
			patch.name = patch.name.trim();
			const [clash] = await db
				.select({ id: speakerCongregations.id })
				.from(speakerCongregations)
				.where(and(eq(speakerCongregations.name, patch.name), ne(speakerCongregations.id, id)));
			if (clash) return NextResponse.json({ error: "name_taken" }, { status: 409 });
		}
		if (Object.keys(patch).length > 0) {
			await db.update(speakerCongregations).set(patch).where(eq(speakerCongregations.id, id));
		}

		const [congregation] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, id));
		return NextResponse.json({ ok: true, congregation });
	} catch (error) {
		if (error instanceof ForkUrlError) return NextResponse.json({ error: "invalid_fork_url" }, { status: 400 });
		return errorResponse(error);
	}
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const db = getDb();
		try {
			await db.delete(speakerCongregations).where(eq(speakerCongregations.id, id));
		} catch (error) {
			// Oradores o discursos enviados que la referencian (clave foránea).
			if (/FOREIGN KEY|constraint/i.test(String(error))) return NextResponse.json({ error: "in_use" }, { status: 409 });
			throw error;
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
