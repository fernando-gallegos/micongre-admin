export {};

// @opennextjs/cloudflare expone los bindings a través de la interfaz global
// `CloudflareEnv` (ver node_modules/@opennextjs/cloudflare/dist/api/cloudflare-context.d.ts),
// no la `Env` que genera `wrangler types` — se fusiona por declaration merging.
declare global {
	interface CloudflareEnv {
		DB: D1Database;
		JWT_SECRET: string;
		VAPID_PUBLIC_KEY: string;
		VAPID_PRIVATE_KEY_JWK: string;
		VAPID_SUBJECT: string;
		/** JSON de la cuenta de servicio de Firebase (push en tiempo real a Android). Opcional: sin él se usa Web Push. */
		FCM_SERVICE_ACCOUNT?: string;
		/** Relay de push de Mi Congre (micongre-router): dirección y clave de esta congregación. Alternativa a tener Firebase propio. */
		PUSH_RELAY_URL?: string;
		PUSH_RELAY_KEY?: string;
	}
}
