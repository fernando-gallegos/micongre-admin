import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
	CONGREGATION_ROW_ID,
	cleaningTasks,
	congregations,
	midweekAssignments,
	midweekMeetings,
	notificationRecipients,
	notifications,
	operationalSchedules,
	outgoingTalks,
	preachingSessionTargets,
	preachingSessionTerritories,
	preachingSessions,
	privileges,
	publicTalkOutlines,
	speakerCongregations,
	speakers,
	territories,
	territoryAssignments,
	users,
	weekendMeetings,
} from "@/db/schema";
import { CLEANING_KIND_LABEL, CLEANING_MEETING_LABEL } from "@/lib/cleaning/labels";
import { chunked } from "@/lib/cleaning/meetings";
import { time12 } from "@/lib/export/builders/meetingDates";
import { loadAssignees } from "@/lib/cleaning/tasks";
import { formatShortDate } from "@/lib/dateFormat";
import { addDays, parseISODate, toISODate } from "@/lib/mwb/dates";
import { sendPushes } from "@/lib/push/dispatch";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import { SECTION_LABELS } from "@/lib/rbac/roles";

/** Hora de Nicaragua (UTC−6, sin horario de verano): la hora configurada en Congregación se interpreta en esa zona. */
const NICARAGUA_OFFSET_HOURS = -6;

export interface ReminderItem {
	/** Fecha (AAAA-MM-DD); vacía para lo que no tiene fecha propia (p. ej. un territorio pendiente). */
	date: string;
	label: string;
}

/** Asignaciones de cada persona en [from, to], con los mismos orígenes que Mi Panel: partes de las reuniones, roles de
 * fin de semana, tareas operativas, discursos enviados, limpieza y (con `weekLong`) territorios pendientes. Todo se
 * consulta por conjunto (no por persona) para no pasar el límite de consultas de un Worker. */
export async function collectAssignments(
	db: Database,
	from: string,
	to: string,
	opts: { weekLong: boolean },
): Promise<Map<string, ReminderItem[]>> {
	const universe = await db
		.select({ id: users.id, fieldServiceGroupId: users.fieldServiceGroupId })
		.from(users)
		.where(and(eq(users.accountStatus, "active"), eq(users.active, true), notHiddenAdmin));
	const eligible = new Set(universe.map((u) => u.id));
	const membersByGroup = new Map<string, string[]>();
	for (const u of universe) {
		if (!u.fieldServiceGroupId) continue;
		membersByGroup.set(u.fieldServiceGroupId, [...(membersByGroup.get(u.fieldServiceGroupId) ?? []), u.id]);
	}

	const out = new Map<string, ReminderItem[]>();
	const add = (userId: string | null | undefined, date: string, label: string) => {
		if (!userId || !eligible.has(userId)) return;
		const list = out.get(userId) ?? [];
		if (!list.some((i) => i.date === date && i.label === label)) list.push({ date, label });
		out.set(userId, list);
	};

	// --- Entre semana ---
	const midweek = (
		await db
			.select({
				id: midweekMeetings.id,
				date: midweekMeetings.meetingDate,
				status: midweekMeetings.status,
				chairman: midweekMeetings.chairmanUserId,
				openingPrayer: midweekMeetings.openingPrayerUserId,
			})
			.from(midweekMeetings)
			.where(and(gte(midweekMeetings.meetingDate, from), lte(midweekMeetings.meetingDate, to)))
	).filter((m) => m.status === "scheduled" || m.status === "adjusted_co_visit");
	const midweekDate = new Map(midweek.map((m) => [m.id, m.date]));
	for (const m of midweek) {
		add(m.chairman, m.date, "Presidente de la reunión de entre semana");
		add(m.openingPrayer, m.date, "Oración inicial (entre semana)");
	}
	for (const ids of chunked(midweek.map((m) => m.id))) {
		const rows = await db
			.select({
				meetingId: midweekAssignments.meetingId,
				sectionType: midweekAssignments.sectionType,
				sectionTitle: midweekAssignments.sectionTitle,
				main: midweekAssignments.mainAssigneeId,
				assistant: midweekAssignments.assistantAssigneeId,
			})
			.from(midweekAssignments)
			.where(inArray(midweekAssignments.meetingId, ids));
		for (const r of rows) {
			const base = SECTION_LABELS[r.sectionType] ?? r.sectionType;
			const label = r.sectionTitle ? `${base} — ${r.sectionTitle}` : base;
			const date = midweekDate.get(r.meetingId) ?? from;
			add(r.main, date, label);
			add(r.assistant, date, `${label} (ayudante)`);
		}
	}

	// --- Fin de semana ---
	const weekend = (
		await db
			.select({
				id: weekendMeetings.id,
				date: weekendMeetings.meetingDate,
				status: weekendMeetings.status,
				chairman: weekendMeetings.chairmanUserId,
				speaker: speakers.userId,
				conductor: weekendMeetings.watchtowerConductorId,
				reader: weekendMeetings.watchtowerReaderId,
				prayer: weekendMeetings.prayerUserId,
			})
			.from(weekendMeetings)
			.leftJoin(speakers, eq(speakers.id, weekendMeetings.speakerId))
			.where(and(gte(weekendMeetings.meetingDate, from), lte(weekendMeetings.meetingDate, to)))
	).filter((m) => m.status !== "cancelled");
	const weekendDate = new Map(weekend.map((m) => [m.id, m.date]));
	for (const m of weekend) {
		add(m.chairman, m.date, "Presidente (fin de semana)");
		add(m.speaker, m.date, "Orador del discurso público");
		add(m.conductor, m.date, "Conductor de La Atalaya");
		add(m.reader, m.date, "Lector de La Atalaya");
		add(m.prayer, m.date, "Oración (fin de semana)");
	}

	// --- Tareas operativas de esas reuniones ---
	for (const [type, dates] of [
		["midweek", midweekDate],
		["weekend", weekendDate],
	] as const) {
		for (const ids of chunked([...dates.keys()])) {
			const rows = await db
				.select({
					meetingId: operationalSchedules.meetingId,
					privilegeName: privileges.name,
					position: operationalSchedules.position,
					userId: operationalSchedules.assignedUserId,
				})
				.from(operationalSchedules)
				.innerJoin(privileges, eq(privileges.id, operationalSchedules.privilegeId))
				.where(
					and(
						eq(operationalSchedules.meetingType, type),
						inArray(operationalSchedules.meetingId, ids),
						isNotNull(operationalSchedules.assignedUserId),
					),
				);
			for (const r of rows) {
				add(r.userId, dates.get(r.meetingId) ?? from, r.position ? `${r.privilegeName} — ${r.position}` : r.privilegeName);
			}
		}
	}

	// --- Discursos en otras congregaciones ---
	const talks = await db
		.select({
			date: outgoingTalks.meetingDate,
			userId: speakers.userId,
			congregation: speakerCongregations.name,
			number: publicTalkOutlines.number,
			title: publicTalkOutlines.title,
		})
		.from(outgoingTalks)
		.innerJoin(speakers, eq(speakers.id, outgoingTalks.speakerId))
		.innerJoin(speakerCongregations, eq(speakerCongregations.id, outgoingTalks.congregationId))
		.innerJoin(publicTalkOutlines, eq(publicTalkOutlines.id, outgoingTalks.talkOutlineId))
		.where(and(gte(outgoingTalks.meetingDate, from), lte(outgoingTalks.meetingDate, to)));
	for (const t of talks) add(t.userId, t.date, `Discurso en ${t.congregation} — ${t.number}. ${t.title}`);

	// --- Predicación (a toda la congregación, a grupos o a publicadores) ---
	const preaching = await db
		.select()
		.from(preachingSessions)
		.where(and(gte(preachingSessions.sessionDate, from), lte(preachingSessions.sessionDate, to)));
	for (const part of chunked(preaching.map((s) => s.id))) {
		const [targetRows, territoryRows] = await Promise.all([
			db.select().from(preachingSessionTargets).where(inArray(preachingSessionTargets.sessionId, part)),
			db
				.select({ sessionId: preachingSessionTerritories.sessionId, number: territories.number })
				.from(preachingSessionTerritories)
				.innerJoin(territories, eq(territories.id, preachingSessionTerritories.territoryId))
				.where(inArray(preachingSessionTerritories.sessionId, part)),
		]);
		for (const s of preaching.filter((p) => part.includes(p.id))) {
			const numbers = territoryRows.filter((t) => t.sessionId === s.id).map((t) => t.number).join(", ");
			const label = `Predicación · ${time12(s.sessionTime)} — Territorio(s) ${numbers}`;
			for (const t of targetRows.filter((x) => x.sessionId === s.id)) {
				if (t.targetType === "congregation") for (const u of universe) add(u.id, s.sessionDate, label);
				else if (t.targetType === "group" && t.groupId) for (const id of membersByGroup.get(t.groupId) ?? []) add(id, s.sessionDate, label);
				else if (t.targetType === "publisher") add(t.userId, s.sessionDate, label);
			}
		}
	}

	// --- Limpieza del Salón del Reino ---
	const tasks: { id: string; kind: "ligera" | "profunda" | "a_fondo"; meetingType: string | null; date: string }[] = [];
	for (const [type, dates] of [
		["midweek", midweekDate],
		["weekend", weekendDate],
	] as const) {
		for (const ids of chunked([...dates.keys()])) {
			const rows = await db
				.select()
				.from(cleaningTasks)
				.where(and(eq(cleaningTasks.kind, "ligera"), eq(cleaningTasks.meetingType, type), inArray(cleaningTasks.meetingId, ids)));
			for (const r of rows) tasks.push({ id: r.id, kind: "ligera", meetingType: type, date: dates.get(r.meetingId ?? "") ?? from });
		}
	}
	if (opts.weekLong) {
		const rows = await db.select().from(cleaningTasks).where(and(eq(cleaningTasks.kind, "profunda"), eq(cleaningTasks.weekStart, from)));
		for (const r of rows) tasks.push({ id: r.id, kind: "profunda", meetingType: null, date: from });
	}
	const fondo = await db
		.select()
		.from(cleaningTasks)
		.where(and(eq(cleaningTasks.kind, "a_fondo"), gte(cleaningTasks.taskDate, from), lte(cleaningTasks.taskDate, to)));
	for (const r of fondo) tasks.push({ id: r.id, kind: "a_fondo", meetingType: null, date: r.taskDate ?? from });

	if (tasks.length > 0) {
		const assignees = await loadAssignees(db, tasks.map((t) => t.id));
		for (const task of tasks) {
			const label =
				task.kind === "ligera" && task.meetingType
					? `${CLEANING_KIND_LABEL.ligera} (${CLEANING_MEETING_LABEL[task.meetingType as "midweek" | "weekend"]})`
					: CLEANING_KIND_LABEL[task.kind];
			for (const a of assignees.get(task.id) ?? []) {
				if (a.type === "own_congregation") for (const u of universe) add(u.id, task.date, label);
				else if (a.type === "group" && a.groupId) for (const id of membersByGroup.get(a.groupId) ?? []) add(id, task.date, label);
			}
		}
	}

	// --- Territorios pendientes (solo en el recordatorio de la semana) ---
	if (opts.weekLong) {
		const rows = await db
			.select({ number: territories.number, name: territories.name, userId: territoryAssignments.assigneeUserId })
			.from(territoryAssignments)
			.innerJoin(territories, eq(territories.id, territoryAssignments.territoryId))
			.where(eq(territoryAssignments.status, "assigned"));
		for (const r of rows) add(r.userId, "", `${r.name ? `Territorio ${r.number} — ${r.name}` : `Territorio ${r.number}`} (pendiente)`);
	}

	for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
	return out;
}

export interface ReminderResult {
	ran: boolean;
	reason?: string;
	kind?: "week" | "weekend";
	users?: number;
	pushes?: number;
}

/** Recordatorio diario (lo dispara el cron de Cloudflare cada hora): a la hora configurada en Congregación, el lunes
 * avisa a cada persona de sus asignaciones de la semana y el viernes de las del fin de semana — un solo aviso (feed de
 * Mi Panel, que también recoge la app Android) y un solo push por persona, aunque tenga varias asignaciones. */
export async function runAssignmentReminders(db: Database, now = new Date(), force = false): Promise<ReminderResult> {
	const [cong] = await db.select().from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
	if (!cong || cong.reminderHour === null) return { ran: false, reason: "disabled" };

	// "Hora local" de Nicaragua: se desplaza el reloj y se leen las partes en UTC.
	const local = new Date(now.getTime() + NICARAGUA_OFFSET_HOURS * 3_600_000);
	const today = toISODate(local);
	const weekday = local.getUTCDay(); // 1 = lunes, 5 = viernes
	if (!force) {
		if (weekday !== 1 && weekday !== 5) return { ran: false, reason: "not_a_reminder_day" };
		if (local.getUTCHours() < cong.reminderHour) return { ran: false, reason: "too_early" };
		if (cong.reminderLastRun === today) return { ran: false, reason: "already_ran" };
	}

	// Se reserva el día antes de enviar: si dos disparos coinciden, solo uno envía.
	const claimed = await db
		.update(congregations)
		.set({ reminderLastRun: today })
		.where(eq(congregations.id, CONGREGATION_ROW_ID))
		.returning({ id: congregations.id });
	if (claimed.length === 0) return { ran: false, reason: "not_claimed" };

	const weekLong = weekday !== 5;
	const from = weekLong ? today : toISODate(addDays(parseISODate(today), 1));
	const to = weekLong ? toISODate(addDays(parseISODate(today), 6)) : toISODate(addDays(parseISODate(today), 2));
	const title = weekLong ? "Tus asignaciones de esta semana" : "Tus asignaciones del fin de semana";

	const byUser = await collectAssignments(db, from, to, { weekLong });
	if (byUser.size === 0) return { ran: true, kind: weekLong ? "week" : "weekend", users: 0, pushes: 0 };

	// La tabla de avisos exige un remitente: se usa un administrador.
	const [sender] = await db.select({ id: users.id }).from(users).where(eq(users.systemRole, "admin")).limit(1);
	if (!sender) return { ran: false, reason: "no_sender" };

	const rows = [...byUser.entries()].map(([userId, items]) => {
		const lines = items.map((i) => `- ${i.date ? `${formatShortDate(i.date)} · ` : ""}${i.label}`);
		return {
			userId,
			id: crypto.randomUUID(),
			message: `**${title}**\n${lines.join("\n")}`,
			push: {
				title,
				body: `${items.length === 1 ? "Tienes 1 asignación" : `Tienes ${items.length} asignaciones`}: ${items.map((i) => i.label).join(" · ")}`.slice(0, 220),
				url: "/panel",
			},
		};
	});

	// Avisos en el feed (D1 admite pocos parámetros por consulta: se insertan por tandas).
	for (const part of chunked(rows, 14)) {
		await db.insert(notifications).values(part.map((r) => ({ id: r.id, senderUserId: sender.id, scope: "publisher" as const, message: r.message, expiresAt: to })));
	}
	for (const part of chunked(rows, 40)) {
		await db.insert(notificationRecipients).values(part.map((r) => ({ notificationId: r.id, userId: r.userId })));
	}

	// Un push por persona (FCM a su Android o Web Push, según lo que tenga configurado el sitio); el aviso del feed ya quedó.
	const pushes = await sendPushes(db, rows.map((x) => ({ userId: x.userId, payload: x.push })));

	return { ran: true, kind: weekLong ? "week" : "weekend", users: rows.length, pushes };
}
