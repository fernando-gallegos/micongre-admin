// Worker de Mi Congre: el de OpenNext (la app) más el cron de Cloudflare que dispara los recordatorios de asignaciones.
// El cron corre cada hora (UTC); la ruta interna decide si toca enviar según la hora configurada en Congregación.
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

async function cronSecret(jwtSecret) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("micongre-cron-reminders"));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
	fetch: handler.fetch,
	async scheduled(_event, env, ctx) {
		const secret = await cronSecret(String(env.JWT_SECRET ?? ""));
		const request = new Request("https://micongre.internal/api/cron/reminders", { method: "POST", headers: { "x-cron-secret": secret } });
		ctx.waitUntil(handler.fetch(request, env, ctx).then(async (r) => console.log("reminders", r.status, await r.text())));
	},
};
