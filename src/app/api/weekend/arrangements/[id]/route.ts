import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations, talkArrangements } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { FederationError, federationFetch } from "@/lib/federation/client";
import { updateArrangementSchema } from "@/lib/federation/validation";
import { publicOrigin } from "@/lib/http/origin";
import { publicBaseUrl } from "@/lib/http/publicUrl";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";

// Cambia el mes de un arreglo que nosotros solicitamos y que aún no se concretó;
// vuelve a "planned" para poder enviar la solicitud de nuevo.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const parsed = updateArrangementSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const db = getDb();
		const [row] = await db.select().from(talkArrangements).where(eq(talkArrangements.id, id));
		if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
		if (row.direction !== "outgoing" || row.status === "accepted") {
			return NextResponse.json({ error: "invalid_state" }, { status: 409 });
		}

		const [clash] = await db
			.select({ id: talkArrangements.id })
			.from(talkArrangements)
			.where(
				and(
					eq(talkArrangements.congregationId, row.congregationId),
					eq(talkArrangements.year, parsed.data.year),
					eq(talkArrangements.month, parsed.data.month),
					ne(talkArrangements.id, id),
				),
			);
		if (clash) return NextResponse.json({ error: "month_taken" }, { status: 409 });

		const [arrangement] = await db
			.update(talkArrangements)
			.set({ ...parsed.data, status: "planned", proposedYear: null, proposedMonth: null, updatedAt: new Date() })
			.where(eq(talkArrangements.id, id))
			.returning();
		return NextResponse.json({ arrangement });
	} catch (error) {
		return errorResponse(error);
	}
}

// Elimina sólo el arreglo de ese mes. Si estaba aceptado (o era una solicitud
// recibida aún pendiente), se avisa al fork para que lo marque como rechazado;
// si no se le puede avisar responde 502 y no borra, salvo con ?force=true.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;
		const force = new URL(request.url).searchParams.get("force") === "true";

		const db = getDb();
		const [row] = await db.select().from(talkArrangements).where(eq(talkArrangements.id, id));
		if (!row) return NextResponse.json({ ok: true });

		const mustNotify = !!row.requestId && (row.status === "accepted" || (row.direction === "incoming" && row.status === "pending"));
		if (mustNotify) {
			const [congregation] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, row.congregationId));
			if (congregation?.forkUrl) {
				try {
					await federationFetch(congregation.forkUrl, "/api/federation/arrangements", {
						method: "POST",
						body: { status: "rejected", requestId: row.requestId, senderUrl: (await publicBaseUrl(db, request)) ?? publicOrigin(request) },
					});
				} catch (error) {
					if (!(error instanceof FederationError) || !force) {
						return NextResponse.json({ error: "notify_failed" }, { status: 502 });
					}
				}
			}
		}

		await db.delete(talkArrangements).where(eq(talkArrangements.id, id));
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
