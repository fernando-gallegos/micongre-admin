import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { fetchHubCongregation, JwHubError, parseHubUrl } from "@/lib/jw/hub";
import { setupFailureResponse } from "@/lib/setup/http";
import { assertSetupOpen } from "@/lib/setup/service";

const bodySchema = z.object({ url: z.string().trim().min(1).max(2000) });

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const weekday = (n: number | null) => (n != null ? (WEEKDAYS[n] ?? "") : "");

// Datos de una congregación desde el JW Hub, a partir de su enlace oficial —
// para precargar el paso "Congregación" del asistente (opcional). Público y
// autocerrable como el resto de /api/setup/*; solo habla con hub.jw.org
// (parseHubUrl rechaza cualquier otro host).
export async function POST(request: Request) {
	try {
		const closed = await assertSetupOpen(getDb());
		if (closed) return setupFailureResponse(closed);

		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) return NextResponse.json({ error: "invalid_url" }, { status: 400 });

		try {
			const { locationId, eventId } = parseHubUrl(parsed.data.url);
			const hub = await fetchHubCongregation(locationId, eventId);
			return NextResponse.json({
				name: hub.name,
				address: hub.address ?? "",
				midweekDay: weekday(hub.midweekMeetingDay),
				midweekTime: hub.midweekMeetingTime ?? "",
				weekendDay: weekday(hub.weekendMeetingDay),
				weekendTime: hub.weekendMeetingTime ?? "",
			});
		} catch (error) {
			if (error instanceof JwHubError) {
				return NextResponse.json({ error: error.code }, { status: error.code === "unavailable" ? 502 : 400 });
			}
			throw error;
		}
	} catch (error) {
		return errorResponse(error);
	}
}
