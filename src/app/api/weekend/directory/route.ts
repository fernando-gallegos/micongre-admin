import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { speakerCongregations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { findOrCreateCongregationByFork, ArrangementError } from "@/lib/federation/arrangements";
import { federationFetch } from "@/lib/federation/client";
import { fetchRouterDirectory } from "@/lib/federation/directory";
import { ForkUrlError, normalizeForkUrl } from "@/lib/federation/forkUrl";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { z } from "zod";

// Congregaciones MiCongre registradas en el router de subdominios, con el
// nombre que publica cada una y si ya la tenemos agregada. Si esta instancia no
// está detrás del router, responde `available: false` y la UI oculta el botón.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const directory = await fetchRouterDirectory(request);
		if (!directory) return NextResponse.json({ available: false, items: [] });
		// ?check=1: sólo si el directorio existe, sin consultar a cada subdominio.
		if (new URL(request.url).searchParams.get("check") === "1") return NextResponse.json({ available: true, items: [] });

		const db = getDb();
		const known = await db.select({ id: speakerCongregations.id, forkUrl: speakerCongregations.forkUrl }).from(speakerCongregations);
		const idByFork = new Map(known.filter((k) => k.forkUrl).map((k) => [k.forkUrl, k.id]));

		const items = await Promise.all(
			directory.map(async (entry) => {
				const info = await federationFetch<{ app?: string; name?: string | null }>(entry.url, "/api/federation/info", {
					timeoutMs: 4000,
				}).catch(() => null);
				return {
					...entry,
					name: info?.app === "micongre" ? (info.name ?? null) : null,
					online: info?.app === "micongre",
					congregationId: idByFork.get(entry.url) ?? null,
				};
			}),
		);
		return NextResponse.json({ available: true, items });
	} catch (error) {
		return errorResponse(error);
	}
}

// Agrega (o enlaza) la congregación de un subdominio del directorio.
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const parsed = z.object({ url: z.string().min(1) }).safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

		const congregation = await findOrCreateCongregationByFork(getDb(), normalizeForkUrl(parsed.data.url));
		return NextResponse.json({ congregation });
	} catch (error) {
		if (error instanceof ForkUrlError) return NextResponse.json({ error: "invalid_fork_url" }, { status: 400 });
		if (error instanceof ArrangementError) return NextResponse.json({ error: error.code }, { status: error.httpStatus });
		return errorResponse(error);
	}
}
