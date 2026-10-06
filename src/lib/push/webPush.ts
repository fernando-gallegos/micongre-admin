import { fromBase64Url, toBase64Url } from "@/lib/auth/encoding";

/** Implementación propia de Web Push (VAPID + cifrado aes128gcm, RFC 8291/8292)
 * usando solo Web Crypto — mismo criterio que `lib/auth/jwt.ts`, para no
 * depender de `node:crypto` ni del paquete npm `web-push` (que sí lo necesita)
 * en un runtime de Workers. */

export interface PushSubscriptionRecord {
	endpoint: string;
	p256dh: string;
	authKey: string;
}

export interface VapidKeys {
	publicKey: string;
	privateKeyJwk: string;
	subject: string;
}

export class WebPushError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

function concatBytes(parts: (Uint8Array<ArrayBuffer> | number[])[]): Uint8Array<ArrayBuffer> {
	const total = parts.reduce((sum, p) => sum + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part instanceof Uint8Array ? part : Uint8Array.from(part), offset);
		offset += part.length;
	}
	return out;
}

async function hmacSha256(keyBytes: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function importVapidPrivateKey(jwk: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidAuthHeader(endpoint: string, vapid: VapidKeys): Promise<string> {
	const origin = new URL(endpoint).origin;
	const now = Math.floor(Date.now() / 1000);
	const header = { typ: "JWT", alg: "ES256" };
	const payload = { aud: origin, exp: now + 12 * 60 * 60, sub: vapid.subject };
	const encodedHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const data = `${encodedHeader}.${encodedPayload}`;

	const privateKey = await importVapidPrivateKey(vapid.privateKeyJwk);
	// La firma ECDSA de Web Crypto ya sale en formato raw r||s (IEEE P1363),
	// que es exactamente lo que exige un JWS ES256 — sin conversión desde DER.
	const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(data));
	const jwt = `${data}.${toBase64Url(new Uint8Array(signature))}`;

	return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/** Cifra el payload según RFC 8291 (Message Encryption for Web Push) sobre el
 * content-coding aes128gcm de RFC 8188, en un solo registro (sin chunking —
 * de sobra para los payloads JSON pequeños que mandamos). */
async function encryptPayload(
	payload: Uint8Array<ArrayBuffer>,
	p256dhB64Url: string,
	authB64Url: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const uaPublicRaw = fromBase64Url(p256dhB64Url);
	const authSecret = fromBase64Url(authB64Url);

	const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
	const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

	const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const sharedSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256),
	);

	const salt = crypto.getRandomValues(new Uint8Array(16));

	const prkKey = await hmacSha256(authSecret, sharedSecret);
	const keyInfo = concatBytes([new TextEncoder().encode("WebPush: info"), [0], uaPublicRaw, asPublicRaw]);
	const ikm = await hmacSha256(prkKey, concatBytes([keyInfo, [1]]));

	const prk = await hmacSha256(salt, ikm);
	const cekInfo = concatBytes([new TextEncoder().encode("Content-Encoding: aes128gcm"), [0]]);
	const cek = new Uint8Array((await hmacSha256(prk, concatBytes([cekInfo, [1]]))).slice(0, 16));
	const nonceInfo = concatBytes([new TextEncoder().encode("Content-Encoding: nonce"), [0]]);
	const nonce = new Uint8Array((await hmacSha256(prk, concatBytes([nonceInfo, [1]]))).slice(0, 12));

	// Delimitador 0x02 = último (único) registro, sin relleno extra.
	const paddedPlaintext = concatBytes([payload, [2]]);
	const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedPlaintext));

	const recordSize = new Uint8Array(4);
	new DataView(recordSize.buffer).setUint32(0, 4096, false);

	const header = concatBytes([salt, recordSize, [asPublicRaw.length], asPublicRaw]);
	return concatBytes([header, ciphertext]);
}

export async function sendWebPush(
	subscription: PushSubscriptionRecord,
	payload: { title: string; body: string; url?: string },
	vapid: VapidKeys,
): Promise<void> {
	const body = await encryptPayload(new TextEncoder().encode(JSON.stringify(payload)), subscription.p256dh, subscription.authKey);
	const authorization = await buildVapidAuthHeader(subscription.endpoint, vapid);

	const response = await fetch(subscription.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/octet-stream",
			"Content-Encoding": "aes128gcm",
			TTL: "2419200",
			Authorization: authorization,
		},
		body,
	});

	if (!response.ok) {
		throw new WebPushError(response.status, `push_failed_${response.status}`);
	}
}
