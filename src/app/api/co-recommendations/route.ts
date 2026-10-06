import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { coRecommendations, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCoVisitDossier, assertCanAccessCoVisitScheduleModule } from "@/lib/rbac/guards";
import { createRecommendationSchema } from "@/lib/validation/coVisit";

export async function GET() {
	try {
		const session = await getSession();
		assertCanAccessCoVisitDossier(session);

		const db = getDb();
		const rows = await db.select().from(coRecommendations).orderBy(desc(coRecommendations.createdAt));

		return NextResponse.json({
			items: rows.map((r) => ({
				...r,
				biblicalQualificationsCheck: r.biblicalQualificationsCheck ? JSON.parse(r.biblicalQualificationsCheck) : null,
			})),
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCoVisitScheduleModule(session);

		const parsed = createRecommendationSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const { biblicalQualificationsCheck, ...rest } = parsed.data;
		const db = getDb();

		// Solo varones que aún no son ancianos pueden ser recomendados.
		const [candidate] = await db.select({ gender: users.gender }).from(users).where(eq(users.id, rest.candidateUserId));
		const [currentElder] = await db
			.select({ id: theocraticAppointments.id })
			.from(theocraticAppointments)
			.where(
				and(
					eq(theocraticAppointments.userId, rest.candidateUserId),
					eq(theocraticAppointments.appointmentType, "elder"),
					isNull(theocraticAppointments.endDate),
				),
			)
			.limit(1);
		if (!candidate || candidate.gender !== "male" || currentElder) {
			return NextResponse.json({ error: "invalid_candidate" }, { status: 422 });
		}

		const [created] = await db
			.insert(coRecommendations)
			.values({
				...rest,
				biblicalQualificationsCheck: biblicalQualificationsCheck ? JSON.stringify(biblicalQualificationsCheck) : null,
				createdByUserId: session.userId,
			})
			.returning({ id: coRecommendations.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
