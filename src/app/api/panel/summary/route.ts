import { and, asc, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	congregations,
	fieldServiceGroups,
	outgoingTalks,
	publicTalkOutlines,
	speakerCongregations,
	speakers,
	theocraticAppointments,
	users,
} from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { getSession } from "@/lib/auth/session";
import { addDays, mondayOf, parseISODate, toISODate } from "@/lib/mwb/dates";
import { territoryMapKindsFor } from "@/lib/territories/mapAccess";
import { isOver, nextTerritorySession, nicaraguaNow, selectUpcoming, territoryVisible } from "@/lib/panel/upcoming";
import { time12 } from "@/lib/export/builders/meetingDates";
import { getUserAssignments } from "@/lib/queries/panel";
import { PRIVILEGE_CODES, SERVICE_COMMITTEE_APPOINTMENTS } from "@/lib/rbac/roles";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

// Todo lo que necesita "Mi panel" en un solo request — asignaciones
// (próximas e historial), grupo de servicio y compañeros de grupo.
export async function GET() {
	try {
		const session = await getSession();
		if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

		const db = getDb();
		// Hoy y la semana en curso, en hora de Nicaragua (UTC−6).
		// Ahora en hora de Nicaragua: lo que ya terminó (predicación 2 h después, reunión al terminar) pasa al historial.
		const now = nicaraguaNow();
		const today = now.date;
		const weekStart = toISODate(mondayOf(parseISODate(today)));
		const weekEnd = toISODate(addDays(parseISODate(weekStart), 6));

		const [assignments, [me], myAppointments] = await Promise.all([
			getUserAssignments(db, session.userId),
			db.select({ fieldServiceGroupId: users.fieldServiceGroupId, theocraticStatus: users.theocraticStatus }).from(users).where(eq(users.id, session.userId)),
			db
				.select({ type: theocraticAppointments.appointmentType })
				.from(theocraticAppointments)
				.where(and(eq(theocraticAppointments.userId, session.userId), isNull(theocraticAppointments.endDate)))
				.then((rows) => rows.map((a) => a.type)),
		]);

		// Quien administra los arreglos de discursos ve quiénes salen a dar discurso esta semana (además de lo suyo).
		const managesTalks =
			session.role === "admin" || session.privilegeCodes.includes(PRIVILEGE_CODES.WEEKEND_ACCESS) || myAppointments.includes("public_talk_coordinator");
		if (managesTalks) {
			const outgoing = await db
				.select({
					date: outgoingTalks.meetingDate,
					time: outgoingTalks.meetingTime,
					speakerUserId: speakers.userId,
					speakerName: users.fullName,
					congregationName: speakerCongregations.name,
					number: publicTalkOutlines.number,
				})
				.from(outgoingTalks)
				.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
				.leftJoin(users, eq(users.id, speakers.userId))
				.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
				.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
				.where(and(gte(outgoingTalks.meetingDate, weekStart), lte(outgoingTalks.meetingDate, weekEnd)));
			for (const o of outgoing) {
				if (o.speakerUserId === session.userId) continue; // el suyo ya sale como su propio discurso
				assignments.push({
					date: o.date,
					meetingType: "outgoing_talk",
					label: `Sale ${o.speakerName ?? "un orador"} a ${o.congregationName} · ${time12(o.time)} — bosquejo ${o.number}`,
					bucket: "talks_out",
					time: o.time,
				});
			}
		}

		// Botón de mapa en las salidas de predicación: el primer territorio dibujado que la persona puede ver.
		const mapKinds: string[] = await territoryMapKindsFor(db, session);
		for (const a of assignments) {
			const pick = a.mapCandidates?.find((c) => mapKinds.includes(c.kind));
			if (pick) a.mapTerritoryId = pick.id;
			delete a.mapCandidates;
		}

		// Próximas: solo lo de la semana en curso, hasta el domingo; el lunes empieza la semana siguiente (no «los próximos 7 días»).
		const horizon = weekEnd;
		// Un territorio pendiente sale solo desde el día antes de su siguiente salida de predicación y hasta 2 horas después de ella
		// (`territoryVisible`); uno ya resuelto es historial.
		const isPendingTerritory = (a: (typeof assignments)[number]) => a.territory?.status === "assigned";
		for (const a of assignments) if (isPendingTerritory(a)) a.nextSessionAt = nextTerritorySession(a.sessions, now);
		const showTerritory = (a: (typeof assignments)[number]) => isPendingTerritory(a) && territoryVisible(a.nextSessionAt, today);
		const isResolvedTerritory = (a: (typeof assignments)[number]) => !!a.territory && !isPendingTerritory(a);
		// Solo lo que sigue de cada tipo (ver lib/panel/upcoming.ts).
		const upcoming = selectUpcoming(
			assignments.filter((a) => showTerritory(a) || (!a.territory && !isOver(a, now) && a.date <= horizon)),
			{ today, weekStart, weekEnd },
		);
		// Historial: todo lo de los últimos 7 días, sin excepción (en Mi Panel se ve en gris).
		const historyFrom = toISODate(addDays(parseISODate(today), -7));
		const history = assignments
			.filter(
				(a) =>
					a.bucket !== "talks_out" &&
					!isPendingTerritory(a) &&
					(isResolvedTerritory(a) ? a.date >= historyFrom : isOver(a, now) && (a.dateEnd ?? a.date) >= historyFrom),
			)
			.reverse()
			// Solo lo más reciente: hasta 3.
			.slice(0, 3)
			.map(({ bucket: _b, territoryIds: _t, when: _w, time: _time, nextSession: _n, sessions: _s, nextSessionAt: _a, timeLabel: _l, ...rest }) => rest);

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
					.select({ id: users.id, fullName: users.fullName, phone: users.phone })
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
				const memberIds = [...memberRows.map((m) => m.id), ...leadIds];
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

				const leadRows = leadIds.length
					? await db.select({ id: users.id, fullName: users.fullName, phone: users.phone }).from(users).where(inArray(users.id, leadIds))
					: [];
				const lead = (id: string | null) => leadRows.find((u) => u.id === id) ?? null;
				const overseerRow = lead(groupRow.overseerUserId);
				const assistantRow = lead(groupRow.assistantUserId);
				const overseer = overseerRow?.fullName ?? null;
				const assistant = assistantRow?.fullName ?? null;
				const badges = (id: string) => appointmentRows.filter((a) => a.userId === id).map((a) => a.appointmentType);
				// `people`: todo el grupo para contactar, primero el superintendente, luego el auxiliar y luego los demás por nombre.
				// (`members` sigue sin ellos para las versiones anteriores de la app.)
				const people = [
					...(overseerRow ? [{ ...overseerRow, role: "overseer" as const, activeAppointmentTypes: badges(overseerRow.id) }] : []),
					...(assistantRow ? [{ ...assistantRow, role: "assistant" as const, activeAppointmentTypes: badges(assistantRow.id) }] : []),
					...members.map((m) => ({ ...m, role: null })),
				];

				group = {
					id: groupRow.id,
					name: groupRow.name,
					color: groupRow.color,
					overseerName: overseer,
					assistantName: assistant,
					members,
					people,
				};
			}
		}

		// Enlaces de acceso rápido: el de ancianos solo lo ven ancianos; el de nombrados, siervos ministeriales y ancianos.
		const [cong] = await db.select().from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
		const isElder = myAppointments.includes("elder");
		const isMinisterialServant = myAppointments.includes("ministerial_servant");
		const isAppointed = isElder || isMinisterialServant;
		const isRegularPioneer = myAppointments.includes("regular_pioneer");
		const isCommittee = myAppointments.some((t) => (SERVICE_COMMITTEE_APPOINTMENTS as readonly string[]).includes(t));
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
			// Solo para quien tiene ese nombramiento: precursores regulares, siervos ministeriales (no ancianos) y el comité.
			if (isRegularPioneer) add("pioneers", "Grupo de precursores regulares", cong.linkPioneersUrl, cong.linkPioneersColor);
			if (isMinisterialServant) add("ministerial", "Grupo de siervos ministeriales", cong.linkMinisterialUrl, cong.linkMinisterialColor);
			if (isCommittee) add("committee", "Grupo del comité de la congregación", cong.linkCommitteeUrl, cong.linkCommitteeColor);
			if (clean(cong.zoomUrl)) links.push({ kind: "zoom", label: "Zoom", url: clean(cong.zoomUrl), color: "#2D8CFF" });
		}

		// canReport: los estudiantes todavía no informan (la app puede ocultar «Mi informe»).
		return NextResponse.json({ upcoming, history, group, links, canReport: me?.theocraticStatus !== "student" });
	} catch (error) {
		return errorResponse(error);
	}
}
