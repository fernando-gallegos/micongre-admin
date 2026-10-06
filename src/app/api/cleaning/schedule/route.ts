import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { cleaningErrorResponse } from "@/lib/cleaning/http";
import { buildSchedule } from "@/lib/cleaning/schedule";
import { assertCanAccessCleaningModule } from "@/lib/rbac/guards";

// Datos del Cronograma de limpieza del Salón del Reino de un año (por defecto
// el actual) — la página imprimible /cleaning/schedule los dibuja.
export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCleaningModule(session);

		const yearParam = Number(new URL(request.url).searchParams.get("year"));
		const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : new Date().getUTCFullYear();

		const db = getDb();
		const [congregation] = await db
			.select({ name: congregations.name })
			.from(congregations)
			.where(eq(congregations.id, CONGREGATION_ROW_ID))
			.limit(1);

		return NextResponse.json({ congregationName: congregation?.name ?? "", schedule: await buildSchedule(db, year) });
	} catch (error) {
		return cleaningErrorResponse(error);
	}
}
