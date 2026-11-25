import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { loadPlannerMonth } from "@/lib/planner/month";
import { assertCanAccessMidweekModule, assertCanAccessOperationalModule, assertCanAccessWeekendModule } from "@/lib/rbac/guards";

/** Vista mensual de un planificador: `?module=midweek|weekend|operational&date=AAAA-MM-DD` (cualquier día del mes; cada semana cuenta en
 * el mes de su lunes). Solo lectura: se guarda con los endpoints de cada planificador. */
export async function GET(request: Request) {
	try {
		const session = await getSession();
		const { searchParams } = new URL(request.url);
		const module = searchParams.get("module");
		const date = searchParams.get("date") ?? "";
		if (module !== "midweek" && module !== "weekend" && module !== "operational") {
			return NextResponse.json({ error: "invalid_module" }, { status: 400 });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
		if (module === "midweek") assertCanAccessMidweekModule(session);
		else if (module === "weekend") assertCanAccessWeekendModule(session);
		else assertCanAccessOperationalModule(session);
		return NextResponse.json(await loadPlannerMonth(getDb(), module, date));
	} catch (error) {
		return errorResponse(error);
	}
}
