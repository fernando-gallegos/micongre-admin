import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { centralAnnouncementImage } from "@/lib/announcements/central";

/** Imagen de una novedad central (la guarda el router): para la web y la app, con sesión. Se guarda un día en el navegador o teléfono. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { name } = await params;
		const image = await centralAnnouncementImage(decodeURIComponent(name));
		if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });
		return new Response(image.body, {
			headers: { "content-type": image.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=86400" },
		});
	} catch (error) {
		return errorResponse(error);
	}
}
