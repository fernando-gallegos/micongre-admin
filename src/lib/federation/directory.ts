import { normalizeForkUrl } from "./forkUrl";

export interface DirectoryEntry {
	subdomain: string;
	url: string;
}

/**
 * Directorio de subdominios del router (ver micongre-router, ruta reservada
 * /__router/subdomains). Sólo existe si esta instancia se sirve a través del
 * router: entonces la petición trae x-forwarded-host con el host público. Sin
 * router (o si no responde) devuelve null y la función no se ofrece.
 * Se excluye la propia congregación.
 */
export async function fetchRouterDirectory(request: Request): Promise<DirectoryEntry[] | null> {
	const host = request.headers.get("x-forwarded-host");
	if (!host || !/^[a-z0-9.-]+$/i.test(host)) return null;

	let ownOrigin: string;
	try {
		ownOrigin = normalizeForkUrl(`https://${host}`);
		const response = await fetch(`${ownOrigin}/__router/subdomains`, {
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return null;
		const data = (await response.json()) as { items?: DirectoryEntry[] };
		return (data.items ?? [])
			.filter((e) => typeof e.subdomain === "string" && typeof e.url === "string")
			.map((e) => ({ subdomain: e.subdomain, url: normalizeForkUrl(e.url) }))
			.filter((e) => e.url !== ownOrigin);
	} catch {
		return null;
	}
}
