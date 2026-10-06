import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, fieldServiceGroups, theocraticAppointments, users } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { getUserAssignments } from "@/lib/queries/panel";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

// Todo lo que necesita "Mi panel" en un solo request — asignaciones
// (próximas e historial), grupo de servicio y compañeros de grupo.
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		const today = new Date().toISOString().slice(0, 10);

		const [assignments, [me]] = await Promise.all([
			getUserAssignments(db, session.userId),
			db.select({ fieldServiceGroupId: users.fieldServiceGroupId }).from(users).where(eq(users.id, session.userId)),
		]);

		// Solo los próximos 30 días (una semana de limpieza profunda en curso cuenta).
		const horizon = toISODate(addDays(parseISODate(today), 30));
		// Un territorio pendiente se muestra hasta que el encargado lo resuelva,
		// sin importar la fecha en que se le asignó; uno ya resuelto es historial.
		const isPendingTerritory = (a: (typeof assignments)[number]) => a.territory?.status === "assigned";
		const isResolvedTerritory = (a: (typeof assignments)[number]) => !!a.territory && !isPendingTerritory(a);
		const upcoming = assignments.filter(
			(a) => isPendingTerritory(a) || (!isResolvedTerritory(a) && (a.dateEnd ?? a.date) >= today && a.date <= horizon),
		);
		// Historial: solo los últimos 30 días.
		const historyFrom = toISODate(addDays(parseISODate(today), -30));
		const history = assignments
			.filter(
				(a) =>
					!isPendingTerritory(a) &&
					(isResolvedTerritory(a) ? a.date >= historyFrom : (a.dateEnd ?? a.date) < today && (a.dateEnd ?? a.date) >= historyFrom),
			)
			.slice(-10)
			.reverse();

		let group = null;
		if (me?.fieldServiceGroupId) {
			const [groupRow] = await db
				.select()
				.from(fieldServiceGroups)
				.where(eq(fieldServiceGroups.id, me.fieldServiceGroupId))
				.limit(1);

			if (groupRow) {
				// El superintendente y el auxiliar ya se muestran aparte — se excluyen
				// de la lista de compañeros para no duplicarlos.
				const leadIds = [groupRow.overseerUserId, groupRow.assistantUserId].filter((id): id is string => !!id);
				const memberRows = await db
					.select({ id: users.id, fullName: users.fullName })
					.from(users)
					.where(
						and(
							eq(users.fieldServiceGroupId, groupRow.id),
							notHiddenAdmin,
							...(leadIds.length ? [notInArray(users.id, leadIds)] : []),
						),
					)
					.orderBy(asc(users.fullName));

				// Nombramientos activos de cada compañero — solo los que importan para
				// las insignias (AC/SM/PR/PA), ver getAppointmentBadges.
				const memberIds = memberRows.map((m) => m.id);
				const appointmentRows = memberIds.length
					? await db
							.select({ userId: theocraticAppointments.userId, appointmentType: theocraticAppointments.appointmentType })
							.from(theocraticAppointments)
							.where(
								and(
									inArray(theocraticAppointments.userId, memberIds),
									isNull(theocraticAppointments.endDate),
									inArray(theocraticAppointments.appointmentType, [
										"elder",
										"ministerial_servant",
										"regular_pioneer",
										"auxiliary_pioneer",
									]),
								),
							)
					: [];
				const members = memberRows.map((m) => ({
					...m,
					activeAppointmentTypes: appointmentRows.filter((a) => a.userId === m.id).map((a) => a.appointmentType),
				}));

				const [overseer, assistant] = await Promise.all([
					groupRow.overseerUserId
						? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, groupRow.overseerUserId)).then((r) => r[0]?.fullName ?? null)
						: null,
					groupRow.assistantUserId
						? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, groupRow.assistantUserId)).then((r) => r[0]?.fullName ?? null)
						: null,
				]);

				group = {
					id: groupRow.id,
					name: groupRow.name,
					color: groupRow.color,
					overseerName: overseer,
					assistantName: assistant,
					members,
				};
			}
		}

		// Enlaces de acceso rápido: el de ancianos solo lo ven ancianos; el de nombrados, siervos ministeriales y ancianos.
		const [cong] = await db.select().from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
		const myAppointments = (
			await db
				.select({ type: theocraticAppointments.appointmentType })
				.from(theocraticAppointments)
				.where(and(eq(theocraticAppointments.userId, session.userId), isNull(theocraticAppointments.endDate)))
		).map((a) => a.type);
		const isElder = myAppointments.includes("elder");
		const isAppointed = isElder || myAppointments.includes("ministerial_servant");
		const links: { kind: string; label: string; url: string; color: string }[] = [];
		const clean = (v: string | null | undefined) => v?.trim() || "";
		if (isElder) links.push({ kind: "hub", label: "Hub", url: "https://hub.jw.org", color: "#F97316" });
		if (cong) {
			const add = (kind: string, label: string, url: string | null, color: string | null) => {
				if (clean(url) && color) links.push({ kind, label, url: clean(url), color });
			};
			add("congregation", "Grupo de la congregación", cong.linkCongregationUrl, cong.linkCongregationColor);
			if (isAppointed) add("appointed", "Grupo de nombrados", cong.linkAppointedUrl, cong.linkAppointedColor);
			if (isElder) add("elders", "Grupo de ancianos", cong.linkEldersUrl, cong.linkEldersColor);
			if (clean(cong.zoomUrl)) links.push({ kind: "zoom", label: "Zoom", url: clean(cong.zoomUrl), color: "#2D8CFF" });
		}

		return NextResponse.json({ upcoming, history, group, links });
	} catch (error) {
		return errorResponse(error);
	}
}
