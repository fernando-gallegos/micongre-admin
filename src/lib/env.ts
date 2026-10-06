import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Acceso tipado a los bindings de Cloudflare (D1, secretos) desde cualquier
 * Route Handler o Server Action, sin importar si corre en Workers real o en
 * `next dev` (donde OpenNext emula el binding). */
export function getEnv() {
	return getCloudflareContext().env;
}
