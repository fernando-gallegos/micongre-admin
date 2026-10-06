import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, type Database } from "@/db/client";
import { publicTalkOutlines, speakerCongregations, speakerOutlines, speakers, talkArrangements } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { FederationError, federationFetch } from "@/lib/federation/client";
import { ForkUrlError } from "@/lib/federation/forkUrl";
import { arrangementActionSchema } from "@/lib/federation/validation";
import { publicOrigin } from "@/lib/http/origin";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";

type Congregation = typeof speakerCongregations.$inferSelect;
type Arrangement = typeof talkArrangements.$inferSelect;

const fail = (error: string, status: number, extra?: Record<string, unknown>) => NextResponse.json({ error, ...extra }, { status });

async function monthTaken(db: Database, row: Arrangement, year: number, month: number) {
	const [clash] = await db
		.select({ id: talkArrangements.id })
		.from(talkArrangements)
		.where(
			and(
				eq(talkArrangements.congregationId, row.congregationId),
				eq(talkArrangements.year, year),
				eq(talkArrangements.month, month),
				ne(talkArrangements.id, row.id),
			),
		);
	return !!clash;
}

// Solicita (o vuelve a solicitar, con otro mes) el arreglo al fork. El
// `requestId` se conserva entre reenvíos para que la otra instancia lo
// reconozca como la misma solicitud.
async function sendRequest(db: Database, request: Request, row: Arrangement, forkUrl: string, year: number, month: number) {
	const requestId = row.requestId ?? crypto.randomUUID();
	const result = await federationFetch<{ status: Arrangement["status"] }>(forkUrl, "/api/federation/arrangements", {
		method: "POST",
		body: { status: "requested", requestId, senderUrl: publicOrigin(request), year, month },
	});
	const status = result.status === "accepted" ? "accepted" : "pending";
	const [updated] = await db
		.update(talkArrangements)
		.set({ requestId, year, month, status, proposedYear: null, proposedMonth: null, updatedAt: new Date() })
		.where(eq(talkArrangements.id, row.id))
		.returning();
	return updated;
}

// Trae del fork los oradores locales habilitados y los registra aquí como
// oradores visitantes de esa congregación (con sus bosquejos, por número).
async function fetchSpeakers(db: Database, row: Arrangement, congregation: Congregation, forkUrl: string) {
	const remote = await federationFetch<{ items: { fullName: string; outlineNumbers: number[] }[] }>(
		forkUrl,
		`/api/federation/speakers?requestId=${encodeURIComponent(row.requestId!)}`,
	);

	const outlines = await db.select({ id: publicTalkOutlines.id, number: publicTalkOutlines.number }).from(publicTalkOutlines);
	const outlineByNumber = new Map(outlines.map((o) => [o.number, o.id]));
	const existing = await db
		.select()
		.from(speakers)
		.where(and(eq(speakers.kind, "visiting"), eq(speakers.congregationId, congregation.id)));
	const existingByName = new Map(existing.map((s) => [s.fullName?.trim().toLowerCase(), s]));

	let added = 0;
	let updated = 0;
	let unknownOutlines = 0;
	for (const item of remote.items) {
		const name = item.fullName.trim();
		if (!name) continue;
		let speaker = existingByName.get(name.toLowerCase());
		if (speaker) {
			updated++;
			if (!speaker.active) await db.update(speakers).set({ active: true }).where(eq(speakers.id, speaker.id));
		} else {
			[speaker] = await db.insert(speakers).values({ kind: "visiting", fullName: name, congregationId: congregation.id }).returning();
			added++;
		}

		const outlineIds = item.outlineNumbers.flatMap((n) => {
			const id = outlineByNumber.get(n);
			if (!id) unknownOutlines++;
			return id ? [id] : [];
		});
		await db.delete(speakerOutlines).where(eq(speakerOutlines.speakerId, speaker.id));
		if (outlineIds.length > 0) {
			await db.insert(speakerOutlines).values(outlineIds.map((outlineId) => ({ speakerId: speaker.id, outlineId })));
		}
	}

	await db.update(talkArrangements).set({ speakersSyncedAt: new Date() }).where(eq(talkArrangements.id, row.id));
	return { added, updated, unknownOutlines, total: remote.items.length };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);
		const { id } = await params;

		const parsed = arrangementActionSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return fail("invalid_body", 400);
		const action = parsed.data;

		const db = getDb();
		const [row] = await db.select().from(talkArrangements).where(eq(talkArrangements.id, id));
		if (!row) return fail("not_found", 404);

		// Acuerdo verbal: se acepta sin comunicarse con la otra instancia (no necesita su URL); los oradores de esa
		// congregación se agregan después a mano en la lista de oradores.
		if (action.action === "accept-verbal") {
			if (row.status !== "planned") return fail("invalid_state", 409);
			const [arrangement] = await db
				.update(talkArrangements)
				.set({ status: "accepted", proposedYear: null, proposedMonth: null, updatedAt: new Date() })
				.where(eq(talkArrangements.id, row.id))
				.returning();
			return NextResponse.json({ arrangement });
		}

		const [congregation] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, row.congregationId));
		const forkUrl = congregation?.forkUrl;
		if (!forkUrl) return fail("no_fork_url", 400);

		// Solicitud saliente (o aceptar el mes que propuso el fork).
		if (action.action === "request" || (action.action === "accept" && row.direction === "outgoing")) {
			if (row.direction !== "outgoing" || row.status === "accepted") return fail("invalid_state", 409);
			const useProposed = action.action === "accept";
			if (useProposed && (row.status !== "counter" || !row.proposedYear || !row.proposedMonth)) return fail("invalid_state", 409);
			const year = useProposed ? row.proposedYear! : row.year;
			const month = useProposed ? row.proposedMonth! : row.month;
			if (useProposed && (await monthTaken(db, row, year, month))) return fail("month_taken", 409);
			return NextResponse.json({ arrangement: await sendRequest(db, request, row, forkUrl, year, month) });
		}

		if (action.action === "fetch-speakers") {
			if (row.status !== "accepted" || !row.requestId) return fail("invalid_state", 409);
			return NextResponse.json({ result: await fetchSpeakers(db, row, congregation, forkUrl) });
		}

		// Respuesta a una solicitud recibida.
		const canReply = row.status === "pending" || (action.action === "counter" && row.status === "counter");
		if (row.direction !== "incoming" || !row.requestId || !canReply) return fail("invalid_state", 409);
		if (action.action === "counter" && (await monthTaken(db, row, action.year, action.month))) return fail("month_taken", 409);

		const comment = action.action === "accept" || action.action === "reject" ? action.comment || undefined : undefined;
		const message =
			action.action === "accept"
				? ({ status: "accepted" } as const)
				: action.action === "reject"
					? ({ status: "rejected" } as const)
					: ({ status: "counter", proposedYear: action.year, proposedMonth: action.month } as const);
		await federationFetch(forkUrl, "/api/federation/arrangements", {
			method: "POST",
			body: { requestId: row.requestId, senderUrl: publicOrigin(request), ...message, ...(comment ? { comment } : {}) },
		});

		const [arrangement] = await db
			.update(talkArrangements)
			.set({
				status: message.status,
				proposedYear: message.status === "counter" ? message.proposedYear : null,
				proposedMonth: message.status === "counter" ? message.proposedMonth : null,
				updatedAt: new Date(),
			})
			.where(eq(talkArrangements.id, row.id))
			.returning();
		return NextResponse.json({ arrangement });
	} catch (error) {
		if (error instanceof FederationError) {
			return fail(error.code === "unreachable" ? "unreachable" : "remote_error", 502, { remoteStatus: error.status });
		}
		if (error instanceof ForkUrlError) return fail("invalid_fork_url", 400);
		return errorResponse(error);
	}
}
