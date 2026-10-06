import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { serviceReports, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { clampProjectHours } from "@/lib/reports/projectHours";
import { RbacError } from "@/lib/rbac/errors";
import { canEditReportsOf, canViewS21 } from "@/lib/rbac/guards";
import { s21PeriodSchema, s21ReportSchema } from "@/lib/validation/reports";

// S-21 (tarjeta de registro de publicador) no es una tabla propia — se deriva
// de users + theocratic_appointments + service_reports (ver plan, sección de
// decisiones técnicas).
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
	try {
		const session = await getSession();
		const { userId } = await params;
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		const db = getDb();
		// Igual que la página web: el propio publicador, quien ve S-21 y quien puede editar los informes de esa persona.
		const canEdit = await canEditReportsOf(db, session, userId);
		if (!canViewS21(session) && session.userId !== userId && !canEdit) {
			throw new RbacError("Se requiere el privilegio de recolección de informes de servicio.");
		}

		const [publisher] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!publisher) return NextResponse.json({ error: "not_found" }, { status: 404 });

		const [appointments, reports] = await Promise.all([
			db
				.select()
				.from(theocraticAppointments)
				.where(eq(theocraticAppointments.userId, userId))
				.orderBy(asc(theocraticAppointments.startDate)),
			db
				.select()
				.from(serviceReports)
				.where(eq(serviceReports.userId, userId))
				.orderBy(asc(serviceReports.periodYear), asc(serviceReports.periodMonth)),
		]);

		const { passwordHash, passwordAlgo, ...safePublisher } = publisher;
		return NextResponse.json({ publisher: safePublisher, appointments, reports, canEdit });
	} catch (error) {
		return errorResponse(error);
	}
}

async function assertCanEdit(userId: string) {
	const session = await getSession();
	if (!session) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
	const db = getDb();
	if (!(await canEditReportsOf(db, session, userId))) {
		throw new RbacError("No tienes permiso para editar los informes de este publicador.");
	}
	const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
	if (!target) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
	return { session, db };
}

function isFuturePeriod(year: number, month: number) {
	const now = new Date();
	return year * 12 + month > now.getFullYear() * 12 + (now.getMonth() + 1);
}

// Alta/edición de un mes de la S-21 (modo edición, línea por línea). Reemplaza
// el informe de ese mes; creditHoursNote (nota de crédito importada) no se toca.
export async function PUT(request: Request, { params }: { params: Promise<{ userId: string }> }) {
	try {
		const { userId } = await params;
		const guard = await assertCanEdit(userId);
		if ("response" in guard) return guard.response;

		const parsed = s21ReportSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}
		const d = parsed.data;
		if (isFuturePeriod(d.periodYear, d.periodMonth)) {
			return NextResponse.json({ error: "future_period" }, { status: 400 });
		}

		const [regularPioneerAppt] = await guard.db
			.select({ id: theocraticAppointments.id })
			.from(theocraticAppointments)
			.where(
				and(eq(theocraticAppointments.userId, userId), eq(theocraticAppointments.appointmentType, "regular_pioneer")),
			)
			.limit(1);

		const values = {
			participatedInMinistry: d.participatedInMinistry || d.bibleStudiesCount > 0 || (d.hours ?? 0) > 0,
			isAuxiliaryPioneerThisMonth: d.isAuxiliaryPioneerThisMonth,
			hours: d.hours ?? null,
			projectHours:
				regularPioneerAppt && !d.isAuxiliaryPioneerThisMonth ? clampProjectHours(d.hours, d.projectHours) : null,
			bibleStudiesCount: d.bibleStudiesCount,
			comments: d.comments || null,
			enteredByUserId: guard.session.userId,
			submittedAt: new Date(),
			status: "submitted" as const,
		};

		await guard.db
			.insert(serviceReports)
			.values({ userId, periodYear: d.periodYear, periodMonth: d.periodMonth, ...values })
			.onConflictDoUpdate({
				target: [serviceReports.userId, serviceReports.periodYear, serviceReports.periodMonth],
				set: values,
			});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}

// Quita el informe de un mes (para deshacer un alta retroactiva equivocada).
export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
	try {
		const { userId } = await params;
		const guard = await assertCanEdit(userId);
		if ("response" in guard) return guard.response;

		const url = new URL(request.url);
		const parsed = s21PeriodSchema.safeParse({
			periodYear: Number(url.searchParams.get("year")),
			periodMonth: Number(url.searchParams.get("month")),
		});
		if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

		await guard.db
			.delete(serviceReports)
			.where(
				and(
					eq(serviceReports.userId, userId),
					eq(serviceReports.periodYear, parsed.data.periodYear),
					eq(serviceReports.periodMonth, parsed.data.periodMonth),
				),
			);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return errorResponse(error);
	}
}
