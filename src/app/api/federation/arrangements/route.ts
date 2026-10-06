import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ArrangementError, applyIncomingRequest, applyRemoteResponse } from "@/lib/federation/arrangements";
import { ForkUrlError } from "@/lib/federation/forkUrl";
import { federationMessageSchema } from "@/lib/federation/validation";

// Público (sin sesión): mensajes de otra instancia de MiCongre sobre un arreglo
// de discursos. La autenticidad descansa en `requestId` (UUID compartido sólo
// entre las dos instancias) y en que `senderUrl` coincida con el fork
// registrado para esa congregación. Ver docs/federation.md.
export async function POST(request: Request) {
	const parsed = federationMessageSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

	try {
		const db = getDb();
		const message = parsed.data;
		if (message.status === "requested") {
			const result = await applyIncomingRequest(db, message);
			return NextResponse.json(result);
		}
		await applyRemoteResponse(db, message);
		return NextResponse.json({ status: message.status });
	} catch (error) {
		if (error instanceof ArrangementError) return NextResponse.json({ error: error.code }, { status: error.httpStatus });
		if (error instanceof ForkUrlError) return NextResponse.json({ error: "invalid_fork_url" }, { status: 400 });
		console.error(error);
		return NextResponse.json({ error: "internal_error" }, { status: 500 });
	}
}
