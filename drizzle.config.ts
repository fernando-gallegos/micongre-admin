import type { Config } from "drizzle-kit";

// Las migraciones reales viven en /migrations como SQL de mano, aplicadas con
// `wrangler d1 migrations apply` (convención del template original de Cloudflare).
// Esta config solo habilita `drizzle-kit studio` para inspeccionar el esquema;
// no se usa `drizzle-kit generate` para no duplicar el flujo de migraciones.
export default {
	dialect: "sqlite",
	schema: "./src/db/schema/index.ts",
	out: "./drizzle",
} satisfies Config;
