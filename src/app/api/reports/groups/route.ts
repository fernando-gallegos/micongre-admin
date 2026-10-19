import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { loadGroupReports } from "@/lib/reports/groups";

/** Informes de un mes agrupados por grupo de servicio (ver lib/reports/groups.ts). Quien solo ve un grupo, solo recibe ese; sin grupos a cargo → 403. */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const { searchParams } = new URL(request.url);
		const now = new Date();
		const year = Number(searchParams.get("year") ?? now.getFullYear());
		const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
		if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
			return NextResponse.json({ error: "invalid_month" }, { status: 400 });
		}

		const groups = await loadGroupReports(getDb(), session, year, month);
		// La respuesta conserva la forma de siempre (la usan la web y Android).
		return NextResponse.json({
			groups: groups.map((g) => ({
				id: g.id,
				name: g.name,
				items: g.items.map(({ groupId: _g, groupName: _n, creditHoursNote: _c, ...rest }) => rest),
			})),
			year,
			month,
		});
	} catch (error) {
		return errorResponse(error);
	}
}
