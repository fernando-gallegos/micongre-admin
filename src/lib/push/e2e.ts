import { fromBase64Url, toBase64Url } from "@/lib/auth/encoding";

/** Cifrado de punta a punta de los push hacia la app Android: el relay (y Firebase) solo ven un bloque ilegible.
 *
 * Esquema "v1": ECDH P-256 con una llave efímera del servidor por mensaje + la llave pública del dispositivo →
 * HKDF-SHA256 (salt = iv, info = "micongre-push-v1") → AES-256-GCM. Lo que viaja: { v, ek (llave efímera, 65 bytes),
 * iv (12 bytes), ct (texto cifrado + etiqueta) } en base64url. La app descifra con su llave privada, que nunca sale
 * del teléfono. */
export const E2E_INFO = "micongre-push-v1";

export interface PushContent {
	title: string;
	body: string;
	url?: string;
	/** Persona a la que va el aviso: la app (con varias cuentas en el mismo teléfono) sabe a cuál pertenece. */
	uid?: string;
}

/** Datos del mensaje FCM: cifrados si el dispositivo registró su llave pública; si no (app anterior), en claro. */
export async function buildPushData(content: PushContent, devicePublicKey: string | null): Promise<Record<string, string>> {
	if (!devicePublicKey) return clearData(content);
	try {
		return await seal(content, devicePublicKey);
	} catch (error) {
		// Una llave inválida no debe impedir el aviso: se manda en claro.
		console.error("push_seal_failed", error);
		return clearData(content);
	}
}

function clearData(content: PushContent): Record<string, string> {
	return { title: content.title, body: content.body, url: content.url ?? "/panel", ...(content.uid ? { uid: content.uid } : {}) };
}

export async function seal(content: PushContent, devicePublicKey: string): Promise<Record<string, string>> {
	const encoder = new TextEncoder();
	const devicePub = await crypto.subtle.importKey("raw", fromBase64Url(devicePublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
	const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
	const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: devicePub }, ephemeral.privateKey, 256);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
	const aesKey = await crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: iv, info: encoder.encode(E2E_INFO) },
		hkdfKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(JSON.stringify({ title: content.title, body: content.body, url: content.url ?? "/panel", ...(content.uid ? { uid: content.uid } : {}) }))),
	);
	const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
	return { v: "1", ek: toBase64Url(ephemeralPublic), iv: toBase64Url(iv), ct: toBase64Url(ciphertext) };
}
