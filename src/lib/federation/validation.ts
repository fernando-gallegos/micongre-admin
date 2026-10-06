import { z } from "zod";

const year = z.number().int().min(2000).max(2200);
const month = z.number().int().min(1).max(12);
// Comentario opcional al responder (instancias que no lo conocen simplemente lo ignoran).
const comment = z.string().trim().max(300);

// Mensajes entre instancias: `requested` lo envía quien solicita; las demás
// son la respuesta de quien recibe la solicitud.
export const federationMessageSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("requested"), requestId: z.string().uuid(), senderUrl: z.string().min(1), year, month }),
	z.object({ status: z.literal("accepted"), requestId: z.string().uuid(), senderUrl: z.string().min(1), comment: comment.optional() }),
	z.object({ status: z.literal("rejected"), requestId: z.string().uuid(), senderUrl: z.string().min(1), comment: comment.optional() }),
	z.object({
		status: z.literal("counter"),
		requestId: z.string().uuid(),
		senderUrl: z.string().min(1),
		proposedYear: year,
		proposedMonth: month,
	}),
]);

export const createArrangementSchema = z.object({
	congregationId: z.string().min(1),
	year,
	month,
});

export const arrangementActionSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("request") }),
	// Arreglo hecho de palabra (sin pasar por la web de la otra congregación): se marca como aceptado a mano.
	z.object({ action: z.literal("accept-verbal") }),
	z.object({ action: z.literal("accept"), comment: comment.optional() }),
	z.object({ action: z.literal("reject"), comment: comment.optional() }),
	z.object({ action: z.literal("counter"), year, month }),
	z.object({ action: z.literal("fetch-speakers") }),
]);

export const updateArrangementSchema = z.object({ year, month });
