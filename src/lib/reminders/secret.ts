/** Secreto interno del cron: el Worker lo calcula a partir de JWT_SECRET para llamarse a sí mismo; desde fuera no se puede adivinar. */
export async function cronSecret(jwtSecret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("micongre-cron-reminders"));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
