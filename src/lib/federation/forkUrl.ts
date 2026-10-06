// El "fork" de una congregación es su propia instancia de MiCongre. Su URL se
// guarda siempre como origen (https://host), sin ruta, y es el destino de las
// llamadas servidor a servidor entre instancias.

export class ForkUrlError extends Error {}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function normalizeForkUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new ForkUrlError("invalid_fork_url");
	}

	// En desarrollo se permite http://localhost para probar dos instancias; en
	// producción sólo https a un nombre de dominio público (el servidor hace la
	// petición, así que no debe poder apuntar a la red interna).
	const dev = process.env.NODE_ENV !== "production";
	const isLocal = url.hostname === "localhost" || url.hostname.endsWith(".localhost");
	if (dev && isLocal && (url.protocol === "http:" || url.protocol === "https:")) return url.origin;

	const host = url.hostname;
	if (
		url.protocol !== "https:" ||
		!host.includes(".") ||
		IPV4.test(host) ||
		host.includes(":") ||
		isLocal ||
		host.endsWith(".local") ||
		host.endsWith(".internal")
	) {
		throw new ForkUrlError("invalid_fork_url");
	}
	return url.origin;
}
