import { normalizeForkUrl } from "./forkUrl";

export class FederationError extends Error {
	constructor(
		public code: "unreachable" | "rejected" | "invalid_response",
		public status?: number,
	) {
		super(code);
	}
}

const TIMEOUT_MS = 10_000;

/** Llamada servidor a servidor a otra instancia de MiCongre (ver docs/federation.md). */
export async function federationFetch<T>(forkUrl: string, path: string, init?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number }): Promise<T> {
	const origin = normalizeForkUrl(forkUrl);
	let response: Response;
	try {
		response = await fetch(`${origin}${path}`, {
			method: init?.method ?? "GET",
			headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
			body: init?.body ? JSON.stringify(init.body) : undefined,
			redirect: "error",
			signal: AbortSignal.timeout(init?.timeoutMs ?? TIMEOUT_MS),
		});
	} catch {
		throw new FederationError("unreachable");
	}
	if (!response.ok) throw new FederationError("rejected", response.status);
	try {
		return (await response.json()) as T;
	} catch {
		throw new FederationError("invalid_response");
	}
}
