// Detrás de un proxy (p. ej. el router de subdominios) el host de la petición
// es el interno; el público llega en x-forwarded-host.
export function publicOrigin(request: Request): string {
	const url = new URL(request.url);
	const host = request.headers.get("x-forwarded-host");
	if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return url.origin;
	const proto = request.headers.get("x-forwarded-proto") === "http" ? "http" : "https";
	return `${proto}://${host}`;
}
