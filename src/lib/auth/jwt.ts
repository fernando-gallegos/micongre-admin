import { fromBase64Url, timingSafeEqual, toBase64Url } from "./encoding";

export interface AccessTokenPayload {
	sub: string;
	role: "admin" | "regular";
	privs: string[];
	fullName: string;
	iat: number;
	exp: number;
}

async function getHmacKey(secret: string) {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export async function signAccessToken(
	payload: Omit<AccessTokenPayload, "iat" | "exp">,
	secret: string,
	ttlSeconds: number,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const fullPayload: AccessTokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
	const header = { alg: "HS256", typ: "JWT" };
	const encodedHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(fullPayload)));
	const data = `${encodedHeader}.${encodedPayload}`;
	const key = await getHmacKey(secret);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAccessToken(
	token: string,
	secret: string,
): Promise<AccessTokenPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	const data = `${encodedHeader}.${encodedPayload}`;

	const key = await getHmacKey(secret);
	const expectedSignature = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
	);
	const providedSignature = fromBase64Url(encodedSignature);
	if (!timingSafeEqual(expectedSignature, providedSignature)) return null;

	let payload: AccessTokenPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
	} catch {
		return null;
	}
	if (payload.exp < Math.floor(Date.now() / 1000)) return null;
	return payload;
}
