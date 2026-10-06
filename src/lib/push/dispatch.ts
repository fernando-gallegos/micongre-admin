import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { deviceTokens, pushSubscriptions } from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { getEnv } from "@/lib/env";
import { buildPushData } from "./e2e";
import { FcmError, parseFcmAccount, sendFcm } from "./fcm";
import { sendWebPush, WebPushError } from "./webPush";

export interface PushPayload {
	title: string;
	body: string;
	url?: string;
}

/** ¿Este sitio usa push en tiempo real de Firebase? (hay cuenta de servicio configurada). Si sí, el push va a los
 * dispositivos Android con la app y se deja de usar Web Push del navegador. */
export function isFcmEnabled(): boolean {
	const env = getEnv();
	return parseFcmAccount(env.FCM_SERVICE_ACCOUNT) !== null || relayConfigured(env);
}

function relayConfigured(env: { PUSH_RELAY_URL?: string; PUSH_RELAY_KEY?: string }): boolean {
	return !!env.PUSH_RELAY_URL?.startsWith("https://") && !!env.PUSH_RELAY_KEY;
}

/** Envía por el relay de Mi Congre (micongre-router): él tiene la clave de Firebase; aquí solo se manda el aviso. Devuelve
 * cuántos salieron y los tokens vencidos. */
async function sendViaRelay(
	env: { PUSH_RELAY_URL?: string; PUSH_RELAY_KEY?: string },
	messages: { token: string; data: Record<string, string> }[],
): Promise<{ sent: number; dead: string[] }> {
	let sent = 0;
	const dead: string[] = [];
	for (const part of chunked(messages, 200)) {
		try {
			const response = await fetch(env.PUSH_RELAY_URL!, {
				method: "POST",
				headers: { Authorization: `Bearer ${env.PUSH_RELAY_KEY}`, "Content-Type": "application/json" },
				body: JSON.stringify({ messages: part }),
			});
			if (!response.ok) {
				console.error("relay_failed", response.status);
				continue;
			}
			const data = (await response.json()) as { sent?: number; dead?: string[] };
			sent += data.sent ?? 0;
			dead.push(...(data.dead ?? []));
		} catch (error) {
			console.error("relay_unreachable", error);
		}
	}
	return { sent, dead };
}

/** Punto único de envío de push: cada elemento lleva su destinatario y su mensaje. Con Firebase configurado envía por
 * FCM a los dispositivos Android; si no, por Web Push a los navegadores suscritos. Nunca lanza — un push fallido no
 * debe tumbar la mutación que lo disparó; los errores solo se registran y un destino vencido se borra solo. */
export async function sendPushes(db: Database, items: { userId: string; payload: PushPayload }[]): Promise<number> {
	if (items.length === 0) return 0;
	const payloadByUser = new Map(items.map((i) => [i.userId, i.payload]));
	const userIds = [...payloadByUser.keys()];
	const env = getEnv();
	let sent = 0;

	const fcm = parseFcmAccount(env.FCM_SERVICE_ACCOUNT);
	if (fcm) {
		const tokens = (
			await Promise.all(chunked(userIds).map((ids) => db.select().from(deviceTokens).where(inArray(deviceTokens.userId, ids))))
		).flat();
		const dead: string[] = [];
		for (const part of chunked(tokens, 10)) {
			await Promise.all(
				part.map(async (t) => {
					try {
						await sendFcm(fcm, t.token, await buildPushData({ ...payloadByUser.get(t.userId)!, uid: t.userId }, t.publicKey));
						sent++;
					} catch (error) {
						if (error instanceof FcmError && (error.status === 404 || error.status === 400)) dead.push(t.id);
						else console.error("fcm_send_failed", t.id, error);
					}
				}),
			);
		}
		for (const ids of chunked(dead)) await db.delete(deviceTokens).where(inArray(deviceTokens.id, ids));
		return sent;
	}

	if (relayConfigured(env)) {
		const tokens = (
			await Promise.all(chunked(userIds).map((ids) => db.select().from(deviceTokens).where(inArray(deviceTokens.userId, ids))))
		).flat();
		// El contenido viaja cifrado de punta a punta (llave pública del dispositivo): el relay no puede leerlo.
		const messages = await Promise.all(tokens.map(async (t) => ({ token: t.token, data: await buildPushData({ ...payloadByUser.get(t.userId)!, uid: t.userId }, t.publicKey) })));
		const { sent: relaySent, dead } = await sendViaRelay(env, messages);
		if (dead.length > 0) for (const part of chunked(dead)) await db.delete(deviceTokens).where(inArray(deviceTokens.token, part));
		return relaySent;
	}

	if (!env.VAPID_PRIVATE_KEY_JWK || !env.VAPID_PUBLIC_KEY) return 0;
	const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKeyJwk: env.VAPID_PRIVATE_KEY_JWK, subject: env.VAPID_SUBJECT };
	const subs = (
		await Promise.all(chunked(userIds).map((ids) => db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids))))
	).flat();
	for (const part of chunked(subs, 10)) {
		await Promise.all(
			part.map(async (sub) => {
				try {
					await sendWebPush(sub, payloadByUser.get(sub.userId)!, vapid);
					sent++;
				} catch (error) {
					if (error instanceof WebPushError && (error.status === 404 || error.status === 410)) {
						await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
					} else {
						console.error("push_send_failed", sub.id, error);
					}
				}
			}),
		);
	}
	return sent;
}

export async function notifyUsers(db: Database, userIds: string[], payload: PushPayload): Promise<void> {
	await sendPushes(
		db,
		[...new Set(userIds)].map((userId) => ({ userId, payload })),
	);
}

export async function notifyUser(db: Database, userId: string, payload: PushPayload): Promise<void> {
	return notifyUsers(db, [userId], payload);
}
