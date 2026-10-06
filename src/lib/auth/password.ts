import { fromBase64Url, timingSafeEqual, toBase64Url } from "./encoding";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

// Sin 0/O/1/l/I para que un publicador que lee la contraseña en pantalla no
// la confunda al escribirla.
const READABLE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

async function deriveBits(plain: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(plain),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		keyMaterial,
		DERIVED_KEY_BITS,
	);
	return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await deriveBits(plain, salt);
	return `${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
	const [saltPart, hashPart] = stored.split(":");
	if (!saltPart || !hashPart) return false;
	const salt = fromBase64Url(saltPart);
	const expected = fromBase64Url(hashPart);
	const actual = await deriveBits(plain, salt);
	return timingSafeEqual(actual, expected);
}

export function generateReadablePassword(length = 8): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = "";
	for (const b of bytes) out += READABLE_CHARS[b % READABLE_CHARS.length];
	return out;
}
