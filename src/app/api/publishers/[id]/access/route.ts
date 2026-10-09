import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { coVisitSchedules, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { issueActivationLink } from "@/lib/auth/activation";
import { getSession } from "@/lib/auth/session";
import { publicBaseUrl } from "@/lib/http/publicUrl";
import { RbacError } from "@/lib/rbac/errors";
import { assertCanAdministerAccounts } from "@/lib/rbac/guards";

const bodySchema = z.object({
	purpose: z.enum(["initial_setup", "password_reset", "circuit_overseer_visit"]).optional(),
	// Requerido cuando purpose = "circuit_overseer_visit" — el enlace (y toda
	// la sesión) vence en co_visit_schedules.endDate para esa visita.
	visitId: z.string().uuid().optional(),
});

// Genera el enlace de un solo toque que el admin comparte fuera de banda
// (WhatsApp, SMS, en persona) — nunca por email. Ver docs/mobile-activation-protocol.md.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const sessionOrNull = await getSession();
		const { id } = await params;
		const db = getDb();
		const session = await assertCanAdministerAccounts(db, sessionOrNull, id);

		const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const [publisher] = await db.select({ username: users.username }).from(users).where(eq(users.id, id)).limit(1);
		if (!publisher) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const purpose = parsed.data.purpose ?? (publisher.username ? "password_reset" : "initial_setup");
		// El acceso temporal del superintendente de circuito sigue siendo solo de admin.
		if (purpose === "circuit_overseer_visit" && session.role !== "admin") {
			throw new RbacError("Solo un administrador puede generar el acceso de la visita del superintendente de circuito.");
		}
		// Dirección pública (la guardada en Congregación o la del router); nunca la URL interna del Worker.
		const baseUrl = await publicBaseUrl(db, request);
		if (!baseUrl) return NextResponse.json({ error: "public_url_required" }, { status: 409 });

		let expiresAtOverride: Date | undefined;
		if (purpose === "circuit_overseer_visit") {
			if (!parsed.data.visitId) {
				return NextResponse.json({ error: "invalid_body", details: "visitId es requerido" }, { status: 400 });
			}
			const [visit] = await db
				.select({ endDate: coVisitSchedules.endDate })
				.from(coVisitSchedules)
				.where(eq(coVisitSchedules.id, parsed.data.visitId))
				.limit(1);
			if (!visit) return NextResponse.json({ error: "visit_not_found" }, { status: 404 });
			expiresAtOverride = new Date(`${visit.endDate}T23:59:59Z`);
		}

		const link = await issueActivationLink(db, {
			userId: id,
			purpose,
			createdByUserId: session.userId,
			baseUrl,
			expiresAtOverride,
		});

		return NextResponse.json({ link, purpose });
	} catch (error) {
		return errorResponse(error);
	}
}
