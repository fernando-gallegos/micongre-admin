import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessWeekendModule } from "@/lib/rbac/guards";
import { fetchSjjEpub, upsertSongs } from "@/lib/songs/catalog";
import { parseSjjEpub } from "@/lib/songs/parseSjj";

/** Importa el catálogo de canciones: desde el EPUB que se sube o, sin archivo, descargándolo de JW.ORG. */
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessWeekendModule(session);

		const formData = await request.formData().catch(() => null);
		const file = formData?.get("file");
		let bytes: ArrayBuffer;
		if (file instanceof File) {
			bytes = await file.arrayBuffer();
		} else {
			try {
				bytes = await fetchSjjEpub();
			} catch {
				return NextResponse.json({ error: "download_failed" }, { status: 502 });
			}
		}

		const parsed = parseSjjEpub(bytes);
		if (parsed.length === 0) {
			return NextResponse.json({ error: "unrecognized_file" }, { status: 422 });
		}
		return NextResponse.json(await upsertSongs(getDb(), parsed));
	} catch (error) {
		return errorResponse(error);
	}
}
