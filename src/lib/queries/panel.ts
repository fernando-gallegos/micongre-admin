import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	cleaningTaskAssignees,
	cleaningTasks,
	congregations,
	fieldServiceGroups,
	midweekAssignments,
	midweekMeetings,
	operationalSchedules,
	outgoingTalks,
	preachingSessionTargets,
	preachingSessionTerritories,
	preachingSessions,
	privileges,
	publicTalkOutlines,
	shepherdingVisitRequests,
	shepherdingVisits,
	speakerCongregations,
	speakers,
	territories,
	territoryAssignments,
	users,
	weekendMeetings,
} from "@/db/schema";
import { readMeetingSchedules } from "@/lib/assignments/stats";
import { effectiveMeetingDate, effectiveMeetingTime, type MeetingSchedules } from "@/lib/attendance/summary";
import { CLEANING_KIND_LABEL, CLEANING_MEETING_LABEL, OWN_CONGREGATION_LABEL } from "@/lib/cleaning/labels";
import { chunked, getCleaningMeetings, isMeetingCancelled } from "@/lib/cleaning/meetings";
import { loadAssignees } from "@/lib/cleaning/tasks";
import { formatShortDayMonth } from "@/lib/dateFormat";
import { time12 } from "@/lib/export/builders/meetingDates";
import { canChangeDepartureAt } from "@/lib/preaching/departureRules";
import { loadDepartures } from "@/lib/preaching/service";
import { nicaraguaNow } from "@/lib/panel/upcoming";
import { departureText, resolveDeparture, type Departure } from "@/lib/territories/geo";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { isServiceCommitteeMember } from "@/lib/rbac/guards";
import { SECTION_LABELS } from "@/lib/rbac/roles";

export interface PanelAssignment {
	date: string;
	/** Último día, para lo que dura varios (p. ej. la semana de una limpieza profunda). */
	dateEnd?: string;
	meetingType:
		| "midweek"
		| "weekend"
		| "operational"
		| "outgoing_talk"
		| "pastoral_visit"
		| "pastoral_visit_request"
		| "cleaning"
		| "preaching"
		| "territory";
	label: string;
	/** Enlace a la ubicación en el mapa (Google Maps), p. ej. del Salón donde se da un discurso. */
	mapUrl?: string;
	/** Línea pequeña debajo (p. ej. la congregación donde se presenta un discurso o el lugar de reunión de la predicación). */
	detail?: string;
	/** Solo para meetingType "territory": lo que Mi Panel necesita para ver el
	 * mapa y para completar o devolver el territorio. */
	territory?: {
		assignmentId: string;
		territoryId: string;
		status: "assigned" | "completed" | "returned";
		comment: string | null;
	};
	// Solo para elegir las próximas (lib/panel/upcoming.ts); no se envían al cliente.
	/** Grupo de «lo que sigue»: `meeting:midweek` / `meeting:weekend` (partes y acomodadores), `preaching:group`, `preaching:public`… */
	bucket?: string;
	/** Hora (HH:MM) para ordenar el mismo día. */
	time?: string;
	/** Predicación: sus territorios, y «03/nov 8:45 a. m.» para mostrarla junto al territorio del capitán. */
	territoryIds?: string[];
	when?: string;
	nextSession?: string;
	/** Territorio pendiente: sus salidas de predicación de esta asignación (fecha y hora). Mi Panel lo muestra solo desde el día antes
	 * de la siguiente y hasta 2 horas después de ella (`nextTerritorySession`, `territoryVisible`). Solo del servidor. */
	sessions?: { date: string; time: string }[];
	/** Territorio pendiente que se muestra: la salida que toca. Solo del servidor. */
	nextSessionAt?: { date: string; time: string };
	/** Predicación: la hora ya escrita («8:45 a. m.»), para el territorio del capitán. Solo del servidor. */
	timeLabel?: string;
	/** Predicación: día que abre el Calendario al tocar la tarjeta (AAAA-MM-DD). */
	openDate?: string;
	/** Predicación: territorio con mapa que la persona puede abrir (botón de mapa en Mi Panel). */
	mapTerritoryId?: string;
	/** Solo del servidor: territorios dibujados de la salida, antes de filtrar por lo que la persona puede ver. */
	mapCandidates?: { id: string; kind: string }[];
	/** Próximas: hora local (Nicaragua, «AAAA-MM-DDTHH:MM») en que termina; después la app y el widget la dejan de mostrar. */
	until?: string;
	/** Predicación: territorios de la salida en los que esta persona (el capitán) puede cambiar el punto de salida. */
	departureChoices?: DepartureChoice[];
}

/** Un territorio de una salida de predicación cuyo punto de salida puede elegir el capitán (más de un punto y dentro del plazo). */
export interface DepartureChoice {
	sessionId: string;
	territoryId: string;
	territoryLabel: string;
	/** El punto de ese día (el elegido o el predeterminado). */
	currentFid: string | null;
	options: Departure[];
}

/** Junta las asignaciones de un publicador en los tres orígenes posibles
 * (partes de la reunión de entre semana, roles de fin de semana, tareas
 * operativas) en una sola lista — el panel personal no necesita saber de la
 * naturaleza polimórfica de operational_schedules por debajo. */
/** Fecha (AAAA-MM-DD) de un instante en hora de Nicaragua (UTC−6, sin horario de verano): en UTC, lo asignado después de las 6 p. m. salía con fecha del día siguiente. */
function nicaraguaDate(instant: Date): string {
	return new Date(instant.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Hora (HH:MM) de la reunión según Congregación → horarios; undefined si no está configurada. */
function meetingTime(schedules: MeetingSchedules | null, type: "midweek" | "weekend", date?: string): string | undefined {
	const t = date ? effectiveMeetingTime(date, type, schedules) : type === "midweek" ? schedules?.midweek?.time : schedules?.weekend?.time;
	return t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : undefined;
}

/** Solo el nombre del territorio (el número, si no tiene nombre). */
const territoryName = (number: string, name: string | null) => name?.trim() || `Territorio ${number}`;
const hhmm = (t: string | null | undefined) => (t && /^\d{1,2}:\d{2}/.test(t) ? time12(t.slice(0, 5)) : null);
/** Enlace a Google Maps con el punto exacto (coordenadas de JW.ORG); sin coordenadas no hay botón. */
export function mapsUrl(place: { latitude?: number | null; longitude?: number | null }): string | undefined {
	return place.latitude != null && place.longitude != null ? `https://www.google.com/maps?q=${place.latitude},${place.longitude}` : undefined;
}
const talkLabel = (outline: number | string | null) => (outline ? `Discurso público — bosquejo #${outline}` : "Discurso público");

export async function getUserAssignments(db: Database, userId: string): Promise<PanelAssignment[]> {
	const assignments: PanelAssignment[] = [];
	// Las reuniones se guardan con el lunes (entre semana) o el sábado (fin de semana) de su semana: se muestran y se pasan
	// al historial con el día en que de verdad se celebran.
	// Las secciones no dependen entre sí: se consultan a la vez (antes iban una tras otra, ~20 viajes seguidos a la base de datos) y
	// se juntan en el mismo orden de siempre.
	const [schedules, [me]] = await Promise.all([
		readMeetingSchedules(db),
		db.select({ fieldServiceGroupId: users.fieldServiceGroupId }).from(users).where(eq(users.id, userId)).limit(1),
	]);
	const realDate = (stored: string, type: "midweek" | "weekend") => effectiveMeetingDate(stored, type, schedules);

	const sections = await Promise.all([
		(async () => {
			const out: PanelAssignment[] = [];
			const midweekRows = await db
				.select({
					meetingDate: midweekMeetings.meetingDate,
					status: midweekMeetings.status,
					sectionType: midweekAssignments.sectionType,
					sectionTitle: midweekAssignments.sectionTitle,
					partNumber: midweekAssignments.partNumber,
					mainAssigneeId: midweekAssignments.mainAssigneeId,
				})
				.from(midweekAssignments)
				.innerJoin(midweekMeetings, eq(midweekMeetings.id, midweekAssignments.meetingId))
				.where(
					or(eq(midweekAssignments.mainAssigneeId, userId), eq(midweekAssignments.assistantAssigneeId, userId)),
				);

			for (const row of midweekRows) {
				if (isMeetingCancelled(row.status)) continue;
				const base = SECTION_LABELS[row.sectionType] ?? row.sectionType;
				const title = row.sectionTitle && row.partNumber ? `${row.partNumber}. ${row.sectionTitle}` : row.sectionTitle;
				const label = title ? `${base} — ${title}` : base;
				const role = row.mainAssigneeId === userId ? "" : " (ayudante)";
				out.push({ date: realDate(row.meetingDate, "midweek"), meetingType: "midweek", label: `${label}${role}`, bucket: "meeting:midweek" });
			}

			// Presidente y oración inicial viven en la reunión, no en midweek_assignments.
			const midweekRoles = await db
				.select({
					meetingDate: midweekMeetings.meetingDate,
					status: midweekMeetings.status,
					chairmanUserId: midweekMeetings.chairmanUserId,
					openingPrayerUserId: midweekMeetings.openingPrayerUserId,
				})
				.from(midweekMeetings)
				.where(or(eq(midweekMeetings.chairmanUserId, userId), eq(midweekMeetings.openingPrayerUserId, userId)));
			for (const row of midweekRoles) {
				if (isMeetingCancelled(row.status)) continue;
				const roles: string[] = [];
				if (row.chairmanUserId === userId) roles.push("Presidente");
				if (row.openingPrayerUserId === userId) roles.push("Oración inicial");
				out.push({ date: realDate(row.meetingDate, "midweek"), meetingType: "midweek", label: roles.join(" · "), bucket: "meeting:midweek" });
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			const weekendRows = await db
				.select({
					meetingDate: weekendMeetings.meetingDate,
					status: weekendMeetings.status,
					chairmanUserId: weekendMeetings.chairmanUserId,
					speakerUserId: speakers.userId,
					outlineNumber: publicTalkOutlines.number,
					watchtowerConductorId: weekendMeetings.watchtowerConductorId,
					watchtowerReaderId: weekendMeetings.watchtowerReaderId,
					prayerUserId: weekendMeetings.prayerUserId,
				})
				.from(weekendMeetings)
				.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
				.leftJoin(publicTalkOutlines, eq(publicTalkOutlines.id, weekendMeetings.talkOutlineId))
				.where(
					or(
						eq(weekendMeetings.chairmanUserId, userId),
						eq(speakers.userId, userId),
						eq(weekendMeetings.watchtowerConductorId, userId),
						eq(weekendMeetings.watchtowerReaderId, userId),
						eq(weekendMeetings.prayerUserId, userId),
					),
				);

			const own = weekendRows.some((r) => r.speakerUserId === userId)
				? (await db.select({ name: congregations.name, latitude: congregations.latitude, longitude: congregations.longitude }).from(congregations).limit(1))[0]
				: undefined;
			const ownTime = hhmm(schedules?.weekend?.time);
			for (const row of weekendRows) {
				if (isMeetingCancelled(row.status)) continue;
				if (row.speakerUserId === userId) {
					out.push({
						date: realDate(row.meetingDate, "weekend"),
						meetingType: "weekend",
						label: talkLabel(row.outlineNumber),
						detail: [own?.name, ownTime].filter(Boolean).join(" · ") || undefined,
						mapUrl: own ? mapsUrl(own) : undefined,
						bucket: "meeting:weekend",
					});
				}
				const roles: string[] = [];
				if (row.chairmanUserId === userId) roles.push("Presidente");
				if (row.watchtowerConductorId === userId) roles.push("Conductor de La Atalaya");
				if (row.watchtowerReaderId === userId) roles.push("Lector de La Atalaya");
				if (row.prayerUserId === userId) roles.push("Oración");
				if (roles.length) out.push({ date: realDate(row.meetingDate, "weekend"), meetingType: "weekend", label: roles.join(" · "), bucket: "meeting:weekend" });
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			const operationalRows = await db
				.select({
					meetingType: operationalSchedules.meetingType,
					meetingId: operationalSchedules.meetingId,
					privilegeName: privileges.name,
					position: operationalSchedules.position,
				})
				.from(operationalSchedules)
				.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
				.where(eq(operationalSchedules.assignedUserId, userId));

			if (operationalRows.length > 0) {
				const midweekIds = operationalRows.filter((r) => r.meetingType === "midweek").map((r) => r.meetingId);
				const weekendIds = operationalRows.filter((r) => r.meetingType === "weekend").map((r) => r.meetingId);

				const [midweekDates, weekendDates] = await Promise.all([
					midweekIds.length
						? db.select({ id: midweekMeetings.id, meetingDate: midweekMeetings.meetingDate, status: midweekMeetings.status }).from(midweekMeetings).where(inArray(midweekMeetings.id, midweekIds))
						: Promise.resolve([]),
					weekendIds.length
						? db.select({ id: weekendMeetings.id, meetingDate: weekendMeetings.meetingDate, status: weekendMeetings.status }).from(weekendMeetings).where(inArray(weekendMeetings.id, weekendIds))
						: Promise.resolve([]),
				]);
				const dateById = new Map([...midweekDates, ...weekendDates].filter((m) => !isMeetingCancelled(m.status)).map((m) => [m.id, m.meetingDate]));

				for (const row of operationalRows) {
					const stored = dateById.get(row.meetingId);
					if (!stored) continue;
					const date = realDate(stored, row.meetingType);
					const label = row.position ? `${row.privilegeName} — ${row.position}` : row.privilegeName;
					out.push({ date, meetingType: "operational", label, bucket: `meeting:${row.meetingType}` });
				}
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			// Limpieza del Salón del Reino (ligera / profunda / a fondo): le toca a cada
			// integrante del grupo asignado, o a todos si la tarea es de toda la
			// congregación — haya o no recibido el aviso (ocultarlo en Mi Panel no
			// quita la asignación). Lo que está a cargo solo de otras congregaciones no
			// aparece. Una reunión cancelada o ya borrada (meetingId sin FK real) no
			// genera asignación.
			const myCleaning = await db
				.select({
					taskId: cleaningTaskAssignees.taskId,
					type: cleaningTaskAssignees.assigneeType,
					groupName: fieldServiceGroups.name,
				})
				.from(cleaningTaskAssignees)
				.leftJoin(fieldServiceGroups, eq(fieldServiceGroups.id, cleaningTaskAssignees.groupId))
				.where(
					or(
						eq(cleaningTaskAssignees.assigneeType, "own_congregation"),
						me?.fieldServiceGroupId ? eq(cleaningTaskAssignees.groupId, me.fieldServiceGroupId) : undefined,
					),
				);

			if (myCleaning.length > 0) {
				const whoByTask = new Map<string, string>();
				for (const row of myCleaning) {
					// Si es de su grupo y de toda la congregación a la vez, se nombra el grupo.
					if (row.type === "group" || !whoByTask.has(row.taskId)) {
						whoByTask.set(row.taskId, row.type === "group" ? (row.groupName ?? "Mi grupo") : OWN_CONGREGATION_LABEL);
					}
				}
				const taskIds = [...whoByTask.keys()];
				const taskRows = (
					await Promise.all(chunked(taskIds).map((ids) => db.select().from(cleaningTasks).where(inArray(cleaningTasks.id, ids))))
				).flat();
				const [assigneesByTask, meetingByKey] = await Promise.all([
					loadAssignees(db, taskIds),
					getCleaningMeetings(
						db,
						taskRows.flatMap((t) =>
							t.kind === "ligera" && t.meetingType && t.meetingId ? [{ meetingType: t.meetingType, meetingId: t.meetingId }] : [],
						),
					),
				]);

				for (const task of taskRows) {
					const who = whoByTask.get(task.id) ?? OWN_CONGREGATION_LABEL;
					const others = (assigneesByTask.get(task.id) ?? [])
						.filter((a) => a.type === "congregation")
						.map((a) => a.congregationName ?? "otra congregación");
					const together = others.length > 0 ? ` · con ${others.join(", ")}` : "";
					const kindLabel = CLEANING_KIND_LABEL[task.kind];

					if (task.kind === "ligera" && task.meetingType && task.meetingId) {
						const meeting = meetingByKey.get(`${task.meetingType}:${task.meetingId}`);
						if (!meeting || meeting.cancelled) continue;
						out.push({
							date: realDate(meeting.date, task.meetingType),
							meetingType: "cleaning",
							label: `${kindLabel} — ${who} (${CLEANING_MEETING_LABEL[task.meetingType]})${together}`,
							time: meetingTime(schedules, task.meetingType, realDate(meeting.date, task.meetingType)),
						});
					} else if (task.kind === "profunda" && task.weekStart) {
						out.push({
							date: task.weekStart,
							dateEnd: toISODate(addDays(parseISODate(task.weekStart), 6)),
							meetingType: "cleaning",
							label: `${kindLabel} — ${who}${together}`,
						});
					} else if (task.kind === "a_fondo" && task.taskDate) {
						out.push({ date: task.taskDate, meetingType: "cleaning", label: `${kindLabel} — ${who}${together}` });
					}
				}
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			// Predicación: salidas asignadas a toda la congregación, a mi grupo o a mí (individualmente).
			const preachingTargets = await db
				.select({ sessionId: preachingSessionTargets.sessionId })
				.from(preachingSessionTargets)
				.where(
					or(
						eq(preachingSessionTargets.targetType, "congregation"),
						eq(preachingSessionTargets.userId, userId),
						me?.fieldServiceGroupId ? eq(preachingSessionTargets.groupId, me.fieldServiceGroupId) : undefined,
					),
				);
			const preachingIds = [...new Set(preachingTargets.map((t) => t.sessionId))];
			for (const ids of chunked(preachingIds)) {
				const [sessions, territoryRows] = await Promise.all([
					db.select().from(preachingSessions).where(inArray(preachingSessions.id, ids)),
					db
						.select({
							sessionId: preachingSessionTerritories.sessionId,
							territoryId: territories.id,
							number: territories.number,
							name: territories.name,
							meetingPlace: territories.meetingPlace,
							kind: territories.kind,
							hasMap: sql<number>`${territories.mapData} is not null`,
							departureFid: preachingSessionTerritories.departureFid,
						})
						.from(preachingSessionTerritories)
						.innerJoin(territories, eq(territories.id, preachingSessionTerritories.territoryId))
						.where(inArray(preachingSessionTerritories.sessionId, ids)),
				]);
				// Puntos de salida de los territorios y de cuáles soy el capitán (asignación vigente a mi nombre).
				const sessionTerritoryIds = [...new Set(territoryRows.map((t) => t.territoryId))];
				const departuresOf = await loadDepartures(db, sessionTerritoryIds);
				const mineAsCaptain = new Set(
					sessionTerritoryIds.length === 0
						? []
						: (
								await db
									.select({ territoryId: territoryAssignments.territoryId })
									.from(territoryAssignments)
									.where(
										and(
											eq(territoryAssignments.assigneeUserId, userId),
											eq(territoryAssignments.status, "assigned"),
											inArray(territoryAssignments.territoryId, sessionTerritoryIds),
										),
									)
							).map((r) => r.territoryId),
				);
				const now = nicaraguaNow();
				for (const s of sessions) {
					const list = territoryRows.filter((t) => t.sessionId === s.id).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
					const names = list.map((t) => territoryName(t.number, t.name)).join(", ");
					// Punto de salida de ese día (nombre y dirección) y las indicaciones de cada territorio.
					const places = [
						...new Set(
							list.flatMap((t) => {
								const d = resolveDeparture(departuresOf.get(t.territoryId) ?? [], t.departureFid);
								const prefix = list.length > 1 && d ? `${t.number}: ` : "";
								return [d ? `Salida: ${prefix}${departureText(d)}` : null, t.meetingPlace?.trim() || null].filter((p): p is string => !!p);
							}),
						),
					];
					const open = canChangeDepartureAt(s.sessionDate, s.sessionTime, now);
					const departureChoices: DepartureChoice[] = open
						? list
								.filter((t) => mineAsCaptain.has(t.territoryId) && (departuresOf.get(t.territoryId)?.length ?? 0) > 1)
								.map((t) => {
									const options = departuresOf.get(t.territoryId) ?? [];
									return {
										sessionId: s.id,
										territoryId: t.territoryId,
										territoryLabel: territoryName(t.number, t.name),
										currentFid: resolveDeparture(options, t.departureFid)?.fid ?? null,
										options,
									};
								})
						: [];
					out.push({
						date: s.sessionDate,
						meetingType: "preaching",
						label: `Predicación: ${time12(s.sessionTime)}${names ? ` ${names}` : ""}${s.note ? ` (${s.note})` : ""}`,
						openDate: s.sessionDate,
						timeLabel: time12(s.sessionTime) ?? s.sessionTime,
						detail: places.join("\n") || undefined,
						bucket: s.kind === "public_preaching" ? "preaching:public" : "preaching:group",
						time: s.sessionTime,
						territoryIds: list.map((t) => t.territoryId),
						when: `${formatShortDayMonth(s.sessionDate)} ${time12(s.sessionTime)}`,
						// Para el botón de mapa: los territorios dibujados (la ruta de Mi Panel deja solo los que la persona puede ver).
						mapCandidates: list.filter((t) => Number(t.hasMap) === 1).map((t) => ({ id: t.territoryId, kind: t.kind })),
						...(departureChoices.length ? { departureChoices } : {}),
					});
				}
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			// Territorios: se muestran como asignación hasta que el encargado los
			// completa o devuelve; las ya resueltas pasan al historial con esa fecha.
			const territoryRows = await db
				.select({
					assignmentId: territoryAssignments.id,
					territoryId: territoryAssignments.territoryId,
					number: territories.number,
					name: territories.name,
					meetingPlace: territories.meetingPlace,
					status: territoryAssignments.status,
					assignedAt: territoryAssignments.assignedAt,
					resolvedAt: territoryAssignments.resolvedAt,
					comment: territoryAssignments.resolutionComment,
				})
				.from(territoryAssignments)
				.innerJoin(territories, eq(territories.id, territoryAssignments.territoryId))
				.where(eq(territoryAssignments.assigneeUserId, userId));

			// Salidas de predicación de cada territorio pendiente en esta asignación (las de `assignment_id`, o en las viejas sin él,
			// las salidas con ese territorio desde el día en que se asignó).
			const pendingRows = territoryRows.filter((r) => r.status === "assigned");
			const sessionRows: { territoryId: string; assignmentId: string | null; sessionDate: string; sessionTime: string }[] = [];
			for (const ids of chunked([...new Set(pendingRows.map((r) => r.territoryId))], 90)) {
				sessionRows.push(
					...(await db
						.select({
							territoryId: preachingSessionTerritories.territoryId,
							assignmentId: preachingSessionTerritories.assignmentId,
							sessionDate: preachingSessions.sessionDate,
							sessionTime: preachingSessions.sessionTime,
						})
						.from(preachingSessionTerritories)
						.innerJoin(preachingSessions, eq(preachingSessions.id, preachingSessionTerritories.sessionId))
						.where(inArray(preachingSessionTerritories.territoryId, ids))),
				);
			}
			const sessionsOf = (row: (typeof territoryRows)[number]) => {
				const since = nicaraguaDate(row.assignedAt);
				return sessionRows
					.filter((s) => s.territoryId === row.territoryId && (s.assignmentId ? s.assignmentId === row.assignmentId : s.sessionDate >= since))
					.map((s) => ({ date: s.sessionDate, time: s.sessionTime }));
			};

			for (const row of territoryRows) {
				const title = territoryName(row.number, row.name);
				const resolvedLabel = row.status === "completed" ? "completado" : "devuelto";
				out.push({
					date: nicaraguaDate(row.status === "assigned" ? row.assignedAt : (row.resolvedAt ?? row.assignedAt)),
					meetingType: "territory",
					label: row.status === "assigned" ? title : `${title} (${resolvedLabel})`,
					detail: row.meetingPlace?.trim() || undefined,
					territory: { assignmentId: row.assignmentId, territoryId: row.territoryId, status: row.status, comment: row.comment },
					sessions: row.status === "assigned" ? sessionsOf(row) : undefined,
				});
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			const outgoingRows = await db
				.select({
					meetingDate: outgoingTalks.meetingDate,
					meetingTime: outgoingTalks.meetingTime,
					congregationName: speakerCongregations.name,
					latitude: speakerCongregations.latitude,
					longitude: speakerCongregations.longitude,
					talkOutlineNumber: publicTalkOutlines.number,
				})
				.from(outgoingTalks)
				.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
				.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
				.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
				.where(eq(speakers.userId, userId));

			for (const row of outgoingRows) {
				out.push({
					date: row.meetingDate,
					meetingType: "outgoing_talk",
					label: talkLabel(row.talkOutlineNumber),
					detail: [row.congregationName, hhmm(row.meetingTime)].filter(Boolean).join(" · "),
					mapUrl: mapsUrl(row),
					time: row.meetingTime?.slice(0, 5) || undefined,
				});
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			// shepherding_visits.eldersAssigned es un JSON de userIds (ver
			// api/pastoral/visits/route.ts) — se filtra en JS, no hay forma de indexar
			// eso en SQLite. dateVisited siempre es una fecha ya ocurrida, así que esto
			// aparece en el historial, no en próximas asignaciones.
			const visitRows = await db
				.select({
					dateVisited: shepherdingVisits.dateVisited,
					eldersAssigned: shepherdingVisits.eldersAssigned,
					publisherName: users.fullName,
				})
				.from(shepherdingVisits)
				.innerJoin(users, eq(users.id, shepherdingVisits.publisherId));

			for (const row of visitRows) {
				const elderIds = JSON.parse(row.eldersAssigned) as string[];
				if (!elderIds.includes(userId)) continue;
				out.push({
					date: row.dateVisited,
					meetingType: "pastoral_visit",
					label: `Visita de pastoreo — ${row.publisherName}`,
				});
			}
			return out;
		})(),
		(async () => {
			const out: PanelAssignment[] = [];
			// Una solicitud de pastoreo sin ancianos asignados es visible para el
			// comité de servicio (quien debe asignarla); una vez asignados los 2
			// ancianos, deja de salirle al comité y pasa a salirle solo a esos 2 —
			// ver api/pastoral/visit-requests/route.ts para la misma regla del lado
			// de la asignación.
			const [visitRequestRows, isCommittee] = await Promise.all([
				db
					.select({
						requestedDate: shepherdingVisitRequests.requestedDate,
						assignedElders: shepherdingVisitRequests.assignedElders,
						publisherName: users.fullName,
					})
					.from(shepherdingVisitRequests)
					.innerJoin(users, eq(users.id, shepherdingVisitRequests.publisherId))
					.where(eq(shepherdingVisitRequests.status, "pending")),
				isServiceCommitteeMember(db, userId),
			]);

			for (const row of visitRequestRows) {
				const assignedElders = row.assignedElders ? (JSON.parse(row.assignedElders) as string[]) : null;
				if (!assignedElders) {
					if (isCommittee) {
						out.push({
							date: row.requestedDate,
							meetingType: "pastoral_visit_request",
							label: `Asignar pastoreo solicitado — ${row.publisherName}`,
						});
					}
				} else if (assignedElders.includes(userId)) {
					out.push({
						date: row.requestedDate,
						meetingType: "pastoral_visit_request",
						label: `Pastoreo solicitado — ${row.publisherName}`,
					});
				}
			}
			return out;
		})(),
	]);
	assignments.push(...sections.flat());


	// Las de reunión (partes, roles, acomodadores) llevan la hora de la reunión: así pasan al historial cuando la reunión termina.
	for (const a of assignments) {
		if (a.time) continue;
		// La hora de esa semana (un evento puede haber movido la reunión); la fecha ya es la real, de la misma semana.
		if (a.bucket === "meeting:midweek") a.time = meetingTime(schedules, "midweek", a.date);
		else if (a.bucket === "meeting:weekend") a.time = meetingTime(schedules, "weekend", a.date);
	}
	return assignments.sort((a, b) => a.date.localeCompare(b.date));
}
