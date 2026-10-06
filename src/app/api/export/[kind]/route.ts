import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { REPORT_BUILDERS } from "@/lib/export/registry";
import { DEFAULT_REPORT_THEME, isReportThemeId, OFFICIAL_REPORT_KINDS } from "@/lib/export/themes";

// Datos de un reporte como ReportDoc (JSON). El navegador lo convierte a docx/png/xlsx.
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const { kind } = await params;
		const builder = REPORT_BUILDERS[kind];
		if (!builder) return NextResponse.json({ error: "unknown_report" }, { status: 404 });

		const url = new URL(request.url);
		url.searchParams.set("kind", kind);
		const db = getDb();
		const doc = await builder({ db, session, params: url.searchParams });
		// Los formatos oficiales no llevan tema; el resto usa el que eligió la congregación.
		if (OFFICIAL_REPORT_KINDS.has(kind)) {
			doc.theme = "plain";
		} else {
			const [row] = await db
				.select({ theme: congregations.reportTheme })
				.from(congregations)
				.where(eq(congregations.id, CONGREGATION_ROW_ID))
				.limit(1);
			doc.theme = isReportThemeId(row?.theme) ? row.theme : DEFAULT_REPORT_THEME;
		}
		return NextResponse.json({ doc });
	} catch (error) {
		return errorResponse(error);
	}
}
