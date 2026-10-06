import { toBase64Url } from "@/lib/auth/encoding";

/** Push en tiempo real a Android con Firebase Cloud Messaging (API HTTP v1), solo con Web Crypto y fetch (sin SDK, igual que
 * Web Push en webPush.ts). Se activa cuando existe el secreto FCM_SERVICE_ACCOUNT: el JSON de la cuenta de servicio. */

export interface FcmAccount {
	project_id: string;
	client_email: string;
	private_key: string;
}

export class FcmError extends Error {
	constructor(
		public status: number,
		public code: string,
	) {
		super(`fcm_${status}_${code}`);
	}
}

/** Lee el JSON de la cuenta de servicio; null si no hay o no es válido (entonces no se usa FCM). */
export function parseFcmAccount(raw: string | undefined): FcmAccount | null {
	if (!raw?.trim()) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<FcmAccount>;
		if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed as FcmAccount;
	} catch {
		// JSON inválido
	}
	return null;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
	const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
	const raw = atob(body);
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(account: FcmAccount): Promise<string> {
	if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

	const now = Math.floor(Date.now() / 1000);
	const encode = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
	const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
		iss: account.client_email,
		scope: "https://www.googleapis.com/auth/firebase.messaging",
		aud: "https://oauth2.googleapis.com/token",
		iat: now,
		exp: now + 3600,
	})}`;
	const key = await crypto.subtle.importKey("pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
	const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));

	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${toBase64Url(signature)}` }),
	});
	if (!response.ok) throw new FcmError(response.status, "oauth_failed");
	const data = (await response.json()) as { access_token: string; expires_in: number };
	cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
	return cached.token;
}

/** Envía un mensaje de datos (la app arma la notificación, así llega igual con la app abierta o cerrada). Lanza FcmError;
 * status 404 (UNREGISTERED) significa que el token ya no sirve y debe borrarse. */
export async function sendFcm(account: FcmAccount, deviceToken: string, data: Record<string, string>): Promise<void> {
	const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
		method: "POST",
		headers: { Authorization: `Bearer ${await accessToken(account)}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			message: {
				token: deviceToken,
				data,
				android: { priority: "HIGH" },
			},
		}),
	});
	if (!response.ok) {
		const detail = (await response.json().catch(() => ({}))) as { error?: { status?: string } };
		throw new FcmError(response.status, detail.error?.status ?? "error");
	}
}
