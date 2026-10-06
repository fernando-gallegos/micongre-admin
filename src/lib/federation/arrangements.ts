import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	notificationRecipients,
	notifications,
	speakerCongregations,
	talkArrangements,
	theocraticAppointments,
} from "@/db/schema";
import { notifyUsers } from "@/lib/push/dispatch";
import { federationFetch } from "./client";
import { normalizeForkUrl } from "./forkUrl";
import { monthLabel } from "./months";

export class ArrangementError extends Error {
	constructor(
		public code: "not_found" | "forbidden" | "month_taken" | "invalid_state" | "unknown_congregation",
		public httpStatus: number,
	) {
		super(code);
	}
}

export type ArrangementRow = typeof talkArrangements.$inferSelect;

// Comité de servicio (coordinador del cuerpo de ancianos, secretario,
// superintendente de servicio) + coordinador de discursos públicos.
const NOTIFIED_APPOINTMENTS = ["cobe", "secretary", "service_overseer", "public_talk_coordinator"] as const;

async function notifyCommittee(db: Database, title: string, message: string) {
	const rows = await db
		.select({ userId: theocraticAppointments.userId })
		.from(theocraticAppointments)
		.where(and(inArray(theocraticAppointments.appointmentType, [...NOTIFIED_APPOINTMENTS]), isNull(theocraticAppointments.endDate)));
	const recipientIds = [...new Set(rows.map((r) => r.userId))];
	if (recipientIds.length === 0) return;

	// La tabla exige un remitente; al no haber un usuario que envíe, se usa el
	// primer destinatario (el mensaje explica de qué se trata).
	const expires = new Date();
	expires.setDate(expires.getDate() + 30);
	const [notification] = await db
		.insert(notifications)
		.values({ senderUserId: recipientIds[0], scope: "publisher", message, expiresAt: expires.toISOString().slice(0, 10) })
		.returning({ id: notifications.id });
	await db.insert(notificationRecipients).values(recipientIds.map((userId) => ({ notificationId: notification.id, userId })));
	await notifyUsers(db, recipientIds, { title, body: message, url: "/meetings/weekend" });
}

async function notifyRequest(db: Database, congregationName: string, year: number, month: number) {
	await notifyCommittee(
		db,
		"Solicitud de arreglo de discursos",
		`La congregación ${congregationName} solicitó hacer arreglo de discursos para ${monthLabel(year, month)}. Acéptalo o recházalo en Fin de semana › Oradores › Congregaciones.`,
	);
}

/** Congregación asociada a un fork; la crea (con el nombre que publica su
 * instancia) si todavía no existe en nuestro catálogo. */
export async function findOrCreateCongregationByFork(db: Database, origin: string) {
	const [byFork] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.forkUrl, origin));
	if (byFork) return byFork;

	// Se confirma que el remitente es realmente una instancia de MiCongre y se
	// toma su nombre de ahí, no del cuerpo de la petición.
	const info = await federationFetch<{ app?: string; name?: string }>(origin, "/api/federation/info").catch(() => null);
	if (!info || info.app !== "micongre" || !info.name?.trim()) throw new ArrangementError("unknown_congregation", 400);
	const name = info.name.trim();

	const [byName] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.name, name));
	if (byName) {
		const [updated] = await db
			.update(speakerCongregations)
			.set({ forkUrl: origin })
			.where(eq(speakerCongregations.id, byName.id))
			.returning();
		return updated;
	}
	const [created] = await db.insert(speakerCongregations).values({ name, forkUrl: origin }).returning();
	return created;
}

async function monthClash(db: Database, congregationId: string, year: number, month: number, exceptId?: string) {
	const [row] = await db
		.select()
		.from(talkArrangements)
		.where(
			and(
				eq(talkArrangements.congregationId, congregationId),
				eq(talkArrangements.year, year),
				eq(talkArrangements.month, month),
				exceptId ? ne(talkArrangements.id, exceptId) : undefined,
			),
		);
	return row ?? null;
}

export interface RemoteRequest {
	requestId: string;
	senderUrl: string;
	year: number;
	month: number;
}

/** Una congregación nos solicita arreglo (o cambia el mes de su solicitud). */
export async function applyIncomingRequest(db: Database, input: RemoteRequest): Promise<{ status: ArrangementRow["status"] }> {
	const origin = normalizeForkUrl(input.senderUrl);
	const [existing] = await db.select().from(talkArrangements).where(eq(talkArrangements.requestId, input.requestId));

	if (existing) {
		const [congregation] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, existing.congregationId));
		if (existing.direction !== "incoming" || congregation?.forkUrl !== origin) throw new ArrangementError("forbidden", 403);

		if (existing.year === input.year && existing.month === input.month && existing.status === "accepted") {
			return { status: "accepted" };
		}
		if (await monthClash(db, existing.congregationId, input.year, input.month, existing.id)) {
			throw new ArrangementError("month_taken", 409);
		}
		// Si aceptan el mes que nosotros propusimos, no hace falta decidir de nuevo.
		const acceptsOurCounter =
			existing.status === "counter" && existing.proposedYear === input.year && existing.proposedMonth === input.month;
		const status = acceptsOurCounter ? "accepted" : "pending";
		await db
			.update(talkArrangements)
			.set({ year: input.year, month: input.month, status, proposedYear: null, proposedMonth: null, updatedAt: new Date() })
			.where(eq(talkArrangements.id, existing.id));
		if (status === "pending") await notifyRequest(db, congregation.name, input.year, input.month);
		return { status };
	}

	const congregation = await findOrCreateCongregationByFork(db, origin);
	const clash = await monthClash(db, congregation.id, input.year, input.month);
	if (clash && clash.status !== "planned") throw new ArrangementError("month_taken", 409);

	if (clash) {
		// Ya lo teníamos anotado sin enviar: pasa a ser la solicitud recibida.
		await db
			.update(talkArrangements)
			.set({ direction: "incoming", status: "pending", requestId: input.requestId, updatedAt: new Date() })
			.where(eq(talkArrangements.id, clash.id));
	} else {
		await db.insert(talkArrangements).values({
			congregationId: congregation.id,
			direction: "incoming",
			year: input.year,
			month: input.month,
			status: "pending",
			requestId: input.requestId,
		});
	}
	await notifyRequest(db, congregation.name, input.year, input.month);
	return { status: "pending" };
}

export interface RemoteResponse {
	requestId: string;
	senderUrl: string;
	status: "accepted" | "rejected" | "counter";
	proposedYear?: number;
	proposedMonth?: number;
	/** Comentario opcional de quien aceptó o rechazó. */
	comment?: string;
}

/** La otra congregación respondió a una solicitud nuestra (o canceló un arreglo aceptado). */
export async function applyRemoteResponse(db: Database, input: RemoteResponse): Promise<void> {
	const origin = normalizeForkUrl(input.senderUrl);
	const [row] = await db.select().from(talkArrangements).where(eq(talkArrangements.requestId, input.requestId));
	if (!row) throw new ArrangementError("not_found", 404);

	const [congregation] = await db.select().from(speakerCongregations).where(eq(speakerCongregations.id, row.congregationId));
	if (congregation?.forkUrl !== origin) throw new ArrangementError("forbidden", 403);

	// Un arreglo ya aceptado puede ser cancelado por cualquiera de las dos partes
	// (en cualquier dirección): se marca como rechazado.
	const cancelsAccepted = input.status === "rejected" && row.status === "accepted";
	if (!cancelsAccepted && (row.direction !== "outgoing" || row.status !== "pending")) {
		throw new ArrangementError(row.direction !== "outgoing" ? "forbidden" : "invalid_state", row.direction !== "outgoing" ? 403 : 409);
	}

	if (input.status === "counter" && (!input.proposedYear || !input.proposedMonth)) {
		throw new ArrangementError("invalid_state", 400);
	}
	await db
		.update(talkArrangements)
		.set({
			status: input.status,
			proposedYear: input.status === "counter" ? (input.proposedYear ?? null) : null,
			proposedMonth: input.status === "counter" ? (input.proposedMonth ?? null) : null,
			updatedAt: new Date(),
		})
		.where(eq(talkArrangements.id, row.id));

	// Si la otra congregación dejó un comentario al responder, el comité lo ve como aviso.
	if (input.comment && (input.status === "accepted" || input.status === "rejected")) {
		await notifyCommittee(
			db,
			"Respuesta a un arreglo de discursos",
			`La congregación ${congregation.name} ${input.status === "accepted" ? "aceptó" : "rechazó"} el arreglo de discursos de ${monthLabel(row.year, row.month)}. Comentario: ${input.comment}`,
		);
	}
}
