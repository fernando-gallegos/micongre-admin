import { toBase64Url } from "./encoding";

/** Token opaco de 32 bytes — usado tanto para refresh tokens como para
 * enlaces de activación. Solo su hash SHA-256 se persiste. */
export function generateOpaqueToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return toBase64Url(bytes);
}

export async function hashOpaqueToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return toBase64Url(new Uint8Array(digest));
}
