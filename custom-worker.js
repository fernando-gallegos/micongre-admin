// Worker de Mi Congre: el de OpenNext (la app) más los crons de Cloudflare: el Job de asignaciones (recordatorios) y el Job diario (programas y congregaciones).
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

async function cronSecret(jwtSecret) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("micongre-cron-reminders"));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
	fetch: handler.fetch,
	// Dos disparadores (wrangler.json → triggers.crons):
	//  · "0 * * * *"  → Job de asignaciones: cada hora; la ruta decide si toca (lunes y viernes, a la hora de Congregación).
	//  · "0 11 * * *" → Job diario: 5:00 a. m. de Nicaragua; deja armados los programas del mes y el siguiente y actualiza las congregaciones.
	async scheduled(event, env, ctx) {
		const secret = await cronSecret(String(env.JWT_SECRET ?? ""));
		const daily = event.cron === "0 11 * * *";
		const path = daily ? "/api/cron/daily" : "/api/cron/reminders";
		const request = new Request("https://micongre.internal" + path, { method: "POST", headers: { "x-cron-secret": secret } });
		ctx.waitUntil(handler.fetch(request, env, ctx).then(async (r) => console.log(daily ? "daily" : "reminders", r.status, await r.text())));
	},
};
