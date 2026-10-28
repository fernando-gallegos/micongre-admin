import { and, asc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
	fieldServiceGroups,
	CONGREGATION_STATUSES,
	publicCongregationStatus,
	splitCongregationStatus,
	THEOCRATIC_STATUSES,
	privileges,
	serviceReports,
	theocraticAppointments,
	userPrivileges,
	users,
} from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import {
	assertCanAccessPublishersModule,
	canViewPrivileges,
	getOwnFieldServiceGroupId,
	isServiceOverseer,
} from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { RbacError } from "@/lib/rbac/errors";
import { notHiddenAdminOnly } from "@/lib/rbac/visibility";
import { getCurrentServiceYear } from "@/lib/serviceYear";
import { createPublisherSchema } from "@/lib/validation/publishers";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessPublishersModule(session);

		const db = getDb();
		const { searchParams } = new URL(request.url);
		const search = searchParams.get("search")?.trim();
		const congregationStatus = searchParams.get("congregationStatus");
		const theocraticStatus = searchParams.get("theocraticStatus");
		const fieldServiceGroupId = searchParams.get("fieldServiceGroupId");
		const includeHidden = searchParams.get("includeHidden") === "true";
		const cursor = Number(searchParams.get("cursor") ?? "0") || 0;

		const conditions = [];
		if (!includeHidden) conditions.push(notHiddenAdminOnly);
		if (search) conditions.push(or(like(users.fullName, `%${search}%`), like(users.username, `%${search}%`)));
		if (congregationStatus === "disfellowshipped") {
			conditions.push(eq(users.disfellowshipped, true));
		} else if (congregationStatus && (CONGREGATION_STATUSES as readonly string[]).includes(congregationStatus)) {
			conditions.push(eq(users.congregationStatus, congregationStatus as (typeof CONGREGATION_STATUSES)[number]));
			conditions.push(eq(users.disfellowshipped, false));
		}
		if (theocraticStatus && (THEOCRATIC_STATUSES as readonly string[]).includes(theocraticStatus)) {
			conditions.push(eq(users.theocraticStatus, theocraticStatus as (typeof THEOCRATIC_STATUSES)[number]));
		}

		// "Publicadores del grupo" (sin admin ni "Todos los publicadores"): se
		// fuerza el grupo propio, pisando el query param si pedía otro.
		if (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)) {
			const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
			if (!ownGroupId) return NextResponse.json({ items: [], nextCursor: null });
			conditions.push(eq(users.fieldServiceGroupId, ownGroupId));
		} else if (fieldServiceGroupId) {
			conditions.push(eq(users.fieldServiceGroupId, fieldServiceGroupId));
		}

		const rows = await db
			.select({
				id: users.id,
				fullName: users.fullName,
				username: users.username,
				gender: users.gender,
				phone: users.phone,
				email: users.email,
				birthDate: users.birthDate,
				baptismDate: users.baptismDate,
				emergencyContactName: users.emergencyContactName,
				emergencyContactPhone: users.emergencyContactPhone,
				emergencyContactRelation: users.emergencyContactRelation,
				isMinor: users.isMinor,
				hasDpaCard: users.hasDpaCard,
				isEligibleForReducedReport: users.isEligibleForReducedReport,
				guardianUserId: users.guardianUserId,
				householdId: users.householdId,
				active: users.active,
				congregationStatus: users.congregationStatus,
				disfellowshipped: users.disfellowshipped,
				theocraticStatus: users.theocraticStatus,
				accountStatus: users.accountStatus,
				fieldServiceGroupId: users.fieldServiceGroupId,
				groupName: fieldServiceGroups.name,
				groupColor: fieldServiceGroups.color,
				systemRole: users.systemRole,
				isHiddenAdmin: users.isHiddenAdmin,
			})
			.from(users)
			.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, users.fieldServiceGroupId))
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(asc(users.fullName))
			.limit(PAGE_SIZE)
			.offset(cursor);

		const userIds = rows.map((r) => r.id);
		// Los privilegios otorgados solo los ven los ancianos y quien administra cuentas.
		const showPrivileges = await canViewPrivileges(db, session);
		const [appointmentRows, privilegeRows] = userIds.length
			? await Promise.all([
					db
						.select({
							id: theocraticAppointments.id,
							userId: theocraticAppointments.userId,
							appointmentType: theocraticAppointments.appointmentType,
							startDate: theocraticAppointments.startDate,
							endDate: theocraticAppointments.endDate,
						})
						.from(theocraticAppointments)
						.where(inArray(theocraticAppointments.userId, userIds)),
					showPrivileges
						? db
						.select({
							id: userPrivileges.id,
							userId: userPrivileges.userId,
							privilegeId: userPrivileges.privilegeId,
							code: privileges.code,
							name: privileges.name,
							active: userPrivileges.active,
						})
						.from(userPrivileges)
						.innerJoin(privileges, eq(privileges.id, userPrivileges.privilegeId))
						.where(inArray(userPrivileges.userId, userIds))
						: Promise.resolve([]),
				])
			: [[], []];

		// Columna "Progreso" (horas del año de servicio, solo precursores
		// regulares): la ve el superintendente de servicio o un admin.
		const canViewProgress = session.role === "admin" || (await isServiceOverseer(db, session.userId));
		let hoursByUserId: Record<string, number> = {};
		if (canViewProgress) {
			const regularPioneerUserIds = appointmentRows
				.filter((a) => a.appointmentType === "regular_pioneer" && !a.endDate)
				.map((a) => a.userId);
			if (regularPioneerUserIds.length > 0) {
				const serviceYear = getCurrentServiceYear();
				const sums = await db
					.select({ userId: serviceReports.userId, hours: sql<number>`coalesce(sum(${serviceReports.hours}), 0) + coalesce(sum(${serviceReports.projectHours}), 0)` })
					.from(serviceReports)
					.where(
						and(
							inArray(serviceReports.userId, regularPioneerUserIds),
							or(
								and(eq(serviceReports.periodYear, serviceYear), gte(serviceReports.periodMonth, 9)),
								and(eq(serviceReports.periodYear, serviceYear + 1), lte(serviceReports.periodMonth, 8)),
							),
						),
					)
					.groupBy(serviceReports.userId);
				hoursByUserId = Object.fromEntries(sums.map((s) => [s.userId, s.hours]));
			}
		}

		const items = rows.map((row) => {
			const rowAppointments = appointmentRows.filter((a) => a.userId === row.id);
			const isRegularPioneer = rowAppointments.some((a) => a.appointmentType === "regular_pioneer" && !a.endDate);
			return {
				...row,
				congregationStatus: publicCongregationStatus(row),
				appointments: rowAppointments,
				privileges: privilegeRows.filter((p) => p.userId === row.id),
				serviceYearHours: canViewProgress && isRegularPioneer ? (hoursByUserId[row.id] ?? 0) : null,
			};
		});

		return NextResponse.json({
			items,
			nextCursor: rows.length === PAGE_SIZE ? cursor + PAGE_SIZE : null,
			canViewProgress,
		});
	} catch (error) {
		return errorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessPublishersModule(session);

		const parsed = createPublisherSchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
		}

		const db = getDb();
		const { congregationStatus: statusInput, ...rest } = parsed.data;
		const values = { ...rest, ...splitCongregationStatus(statusInput) };

		// "Publicadores del grupo" (sin admin ni "Todos los publicadores"): solo
		// puede crear publicadores dentro de su propio grupo de servicio — se
		// fuerza el grupo propio, y se rechaza si el body pedía explícitamente
		// otro grupo distinto.
		if (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.PUBLISHERS_ALL)) {
			const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
			if (!ownGroupId || (values.fieldServiceGroupId && values.fieldServiceGroupId !== ownGroupId)) {
				throw new RbacError("Solo puedes crear publicadores dentro de tu propio grupo de servicio.");
			}
			values.fieldServiceGroupId = ownGroupId;
		}

		const [created] = await db.insert(users).values(values).returning({ id: users.id });

		return NextResponse.json({ id: created.id }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
}
