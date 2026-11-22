import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { applyUpcomingEvents, notifyDueEvents } from "@/lib/events/service";
import { syncJwCatalog, type CatalogSyncResult } from "@/lib/literature/jwCatalog";
import { syncOutlineCatalog, type OutlineCatalogResult } from "@/lib/publicTalks/catalogSync";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/db/client";
import { syncOwnCongregation } from "@/lib/jw/ownCongregation";
import { midweekAssignments, midweekMeetings, speakerCongregations, weekendMeetings } from "@/db/schema";
import { chunked } from "@/lib/cleaning/meetings";
import { JwHubError, fetchHubCongregation, hubCongregationColumns, parseHubUrl } from "@/lib/jw/hub";
import { addDays, issueCodeForWeek, parseISODate, toISODate, weekStartsOfMonth } from "@/lib/mwb/dates";
import { runReportReminders, type ReportReminderResult } from "@/lib/reminders/reports";
import { runStudyReminders } from "@/lib/pioneer/service";
import { fetchMwbEpub } from "@/lib/mwb/fetchEpub";
import { parseWeekPrograms } from "@/lib/mwb/parseProgram";
import { mwbLinkFields, programRows, ROWS_PER_INSERT } from "@/lib/mwb/programRows";
import { applyProgramToMeeting } from "@/lib/mwb/applyProgram";
import { MIDWEEK_FIXED_SECTIONS } from "@/lib/rbac/roles";
import { getDefaultWatchtowerConductorId } from "@/lib/weekend/defaults";
import { ensureSongsCatalog } from "@/lib/songs/catalog";
import { importWatchtowerForWeeks } from "@/lib/weekend/watchtower";
import { purgeOldOperations } from "@/lib/http/idempotency";
import { purgeOldRefreshTokens } from "@/lib/auth/refresh";
import { currentWeekStart, syncUpcomingMeetings, type SyncResult } from "@/lib/operational/template";
import { nicaraguaToday, runRecurringPreaching, type RecurringResult } from "@/lib/preaching/recurring";

/** Hora de Nicaragua (UTC−6, sin horario de verano). */
const NICARAGUA_OFFSET_HOURS = -6;

export interface DailyResult {
	midweek: { created: number; imported: number; skeletons: number; filled: number; errors: string[] };
	weekend: { created: number };
	/** Puestos de tareas operativas ajustados a la plantilla (null si falló). */
	operational: SyncResult | null;
	/** Predicación recurrente: salidas creadas para la semana siguiente, series terminadas y salidas quitadas (null si falló). */
	preaching: RecurringResult | null;
	congregations: { checked: number; updated: number; failed: { name: string; reason: string }[] };
	/** Recordatorio del informe del mes anterior (null si falló). */
	reports: ReportReminderResult | null;
	studies: { users: number; studies: number } | null;
	/** Eventos aplicados a sus reuniones y avisos enviados (null si falló). */
	events: { applied: number; notified: number } | null;
	/** Publicaciones nuevas de JW.ORG agregadas al catálogo de literatura (null si falló). */
	literature: CatalogSyncResult | null;
	/** Catálogo central de bosquejos (S-99a) del router aplicado al de esta congregación (null si falló). */
	outlines: OutlineCatalogResult | null;
}

/** Lunes de cada semana cuyo lunes cae en el mes (AAAA-MM) — igual que `weekStartsOfMonth`, que cuenta cada semana en el mes de su lunes. */
function mondaysOfMonth(year: number, month0: number): string[] {
	const first = new Date(Date.UTC(year, month0, 1));
	const firstMonday = addDays(first, (8 - first.getUTCDay()) % 7);
	return weekStartsOfMonth(toISODate(firstMonday));
}

/** Entre semana: crea las reuniones que falten (con el programa de la guía si ya está publicada; si no, solo con las partes fijas) y deja
 * las que ya existen igual que la guía (títulos, canciones, partes, enlaces a JW Library) sin cambiar a nadie de su asignación. */
async function ensureMidweek(db: Database, mondays: string[], out: DailyResult["midweek"]): Promise<void> {
	if (mondays.length === 0) return;
	const lastSunday = toISODate(addDays(parseISODate(mondays[mondays.length - 1]), 6));
	const meetings = await db
		.select()
		.from(midweekMeetings)
		.where(and(gte(midweekMeetings.meetingDate, mondays[0]), lte(midweekMeetings.meetingDate, lastSunday)));
	const byWeek = (monday: string) => {
		const sunday = toISODate(addDays(parseISODate(monday), 6));
		return meetings.find((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
	};

	let programs: ReturnType<typeof parseWeekPrograms> = new Map();
	try {
		programs = parseWeekPrograms(await fetchMwbEpub(issueCodeForWeek(mondays[0])), mondays);
	} catch (error) {
		out.errors.push(`Guía de ${mondays[0].slice(0, 7)}: ${(error as Error).message || "no disponible"}`);
	}

	const parts = meetings.length
		? (
				await Promise.all(chunked(meetings.map((m) => m.id)).map((ids) => db.select().from(midweekAssignments).where(inArray(midweekAssignments.meetingId, ids))))
			).flat()
		: [];

	for (const monday of mondays) {
		const existing = byWeek(monday);
		const program = programs.get(monday);

		if (!existing) {
			if (program) {
				const rows = programRows(program);
				const [meeting] = await db
					.insert(midweekMeetings)
					.values({
						meetingDate: monday,
						weekLabel: program.weekLabel,
						openingSongNumber: program.openingSongNumber,
						closingSongNumber: program.closingSongNumber,
						middleSongNumber: program.middleSongNumber,
						studyLessonReference: program.cbs.title,
						...mwbLinkFields(program),
					})
					.returning({ id: midweekMeetings.id });
				for (const chunk of chunked(rows, ROWS_PER_INSERT)) {
					await db.insert(midweekAssignments).values(chunk.map((row) => ({ ...row, meetingId: meeting.id })));
				}
				out.imported++;
			} else {
				const [meeting] = await db.insert(midweekMeetings).values({ meetingDate: monday }).returning({ id: midweekMeetings.id });
				await db.insert(midweekAssignments).values(
					MIDWEEK_FIXED_SECTIONS.map((section) => ({
						meetingId: meeting.id,
						sectionType: section.sectionType,
						sectionTitle: section.sectionTitle,
						sequenceOrder: section.sequenceOrder,
						privilegeId: section.privilegeId,
					})),
				);
				out.skeletons++;
			}
			out.created++;
			continue;
		}

		// Ya existe: se actualiza con la guía (solo lo que cambió), sin tocar asignaciones.
		if (!program) continue;
		const current = parts.filter((p) => p.meetingId === existing.id);
		if (await applyProgramToMeeting(db, existing, current, program)) out.filled++;
	}
}

/** Fin de semana: crea el sábado de las semanas que no tengan reunión; las que ya existen no se tocan. */
async function ensureWeekend(db: Database, mondays: string[]): Promise<number> {
	if (mondays.length === 0) return 0;
	const lastSunday = toISODate(addDays(parseISODate(mondays[mondays.length - 1]), 6));
	const existing = await db
		.select({ meetingDate: weekendMeetings.meetingDate })
		.from(weekendMeetings)
		.where(and(gte(weekendMeetings.meetingDate, mondays[0]), lte(weekendMeetings.meetingDate, lastSunday)));
	const missing = mondays.filter((monday) => {
		const sunday = toISODate(addDays(parseISODate(monday), 6));
		return !existing.some((m) => m.meetingDate >= monday && m.meetingDate <= sunday);
	});
	if (missing.length === 0) return 0;
	const watchtowerConductorId = await getDefaultWatchtowerConductorId(db);
	await db.insert(weekendMeetings).values(missing.map((monday) => ({ meetingDate: toISODate(addDays(parseISODate(monday), 5)), watchtowerConductorId })));
	return missing.length;
}

/** Congregaciones de arreglos con enlace de jw.org: vuelve a leer del Hub su día y hora de reunión (y demás datos). */
async function syncCongregations(db: Database, out: DailyResult["congregations"]): Promise<void> {
	// La nuestra también, si tiene enlace (Congregación → JW.ORG).
	try {
		if (await syncOwnCongregation(db)) out.updated++;
	} catch (error) {
		out.failed.push({ name: "Nuestra congregación", reason: error instanceof JwHubError ? error.code : "error" });
	}
	const rows = await db.select().from(speakerCongregations).where(isNotNull(speakerCongregations.jwUrl));
	for (const current of rows) {
		out.checked++;
		try {
			const { locationId, eventId } = parseHubUrl(current.jwUrl ?? "");
			const hub = await fetchHubCongregation(locationId, eventId);
			// El Hub pudo renombrarla a un nombre que ya usa otra congregación: se deja como está.
			const [clash] = await db
				.select({ id: speakerCongregations.id })
				.from(speakerCongregations)
				.where(and(eq(speakerCongregations.name, hub.name), ne(speakerCongregations.id, current.id)));
			if (clash) {
				out.failed.push({ name: current.name, reason: "name_conflict" });
				continue;
			}
			await db.update(speakerCongregations).set(hubCongregationColumns(hub, current.jwUrl ?? "")).where(eq(speakerCongregations.id, current.id));
			out.updated++;
		} catch (error) {
			out.failed.push({ name: current.name, reason: error instanceof JwHubError ? error.code : "error" });
		}
	}
}

/** Job diario: (1) deja armados los programas del mes en curso y del siguiente (entre semana y fin de semana) y
 * con sus puestos de tareas operativas según la plantilla, y (2) actualiza desde jw.org el día y la hora de las congregaciones de arreglos que tienen enlace. Cada paso es independiente:
 * si uno falla, el otro corre igual. `only` limita a un paso (pruebas). */
export async function runDailyJob(db: Database, now = new Date(), only?: "programs" | "congregations" | "reports" | "preaching" | "events" | "literature" | "studies" | "outlines"): Promise<DailyResult> {
	const result: DailyResult = {
		midweek: { created: 0, imported: 0, skeletons: 0, filled: 0, errors: [] },
		weekend: { created: 0 },
		operational: null,
		preaching: null,
		congregations: { checked: 0, updated: 0, failed: [] },
		reports: null,
		studies: null,
		events: null,
		literature: null,
		outlines: null,
	};

	if (!only || only === "programs") {
		await ensureSongsCatalog(db);
		const local = new Date(now.getTime() + NICARAGUA_OFFSET_HOURS * 3_600_000);
		const year = local.getUTCFullYear();
		const month = local.getUTCMonth();
		const months: [number, number][] = [
			[year, month],
			[month === 11 ? year + 1 : year, (month + 1) % 12],
		];
		for (const [y, m] of months) {
			const mondays = mondaysOfMonth(y, m);
			try {
				await ensureMidweek(db, mondays, result.midweek);
			} catch (error) {
				result.midweek.errors.push(`Entre semana ${y}-${String(m + 1).padStart(2, "0")}: ${(error as Error).message}`);
			}
			try {
				result.weekend.created += await ensureWeekend(db, mondays);
				// Estudio de La Atalaya (título y canciones) de JW.ORG para las que aún no lo tengan.
				await importWatchtowerForWeeks(db, mondays);
			} catch (error) {
				console.error("daily_weekend_failed", error);
			}
		}
		// Tareas operativas: cada reunión desde la semana en curso queda con los puestos de la plantilla
		// (agrega los que falten y quita los que sobren, solo si nadie los ocupa).
		try {
			result.operational = await syncUpcomingMeetings(db, currentWeekStart(now));
		} catch (error) {
			console.error("daily_operational_failed", error);
		}
	}

	if (!only) {
		try {
			await purgeOldOperations(db);
		} catch (error) {
			console.error("daily_purge_operations_failed", error);
		}
		try {
			await purgeOldRefreshTokens(db);
		} catch (error) {
			console.error("daily_purge_refresh_tokens_failed", error);
		}
	}
	// Eventos: se aplican a las reuniones creadas después del evento (cancelar = sin asignaciones) y se avisa a la congregación
	// los días antes que diga cada uno.
	if (!only || only === "programs" || only === "events") {
		try {
			const today = nicaraguaToday(now);
			result.events = { applied: await applyUpcomingEvents(db, today), notified: await notifyDueEvents(db, today) };
		} catch (error) {
			console.error("daily_events_failed", error);
		}
	}
	// Predicación recurrente: el día de cada salida se crea la de la semana siguiente (mientras siga el mismo capitán).
	if (!only || only === "preaching") {
		try {
			result.preaching = await runRecurringPreaching(db, nicaraguaToday(now), { generate: true });
		} catch (error) {
			console.error("daily_preaching_failed", error);
		}
	}
	if (!only || only === "congregations") {
		try {
			await syncCongregations(db, result.congregations);
		} catch (error) {
			console.error("daily_congregations_failed", error);
		}
	}
	if (!only || only === "literature") {
		try {
			result.literature = await syncJwCatalog(db, now);
		} catch (error) {
			console.error("daily_literature_failed", error);
		}
	}
	if (!only || only === "outlines") {
		try {
			result.outlines = await syncOutlineCatalog(db);
		} catch (error) {
			console.error("daily_outlines_failed", error);
		}
	}
	if (!only || only === "reports") {
		try {
			result.reports = await runReportReminders(db, now);
		} catch (error) {
			console.error("daily_report_reminders_failed", error);
		}
	}
	// Precursorado: aviso (push) de los estudios que cada precursor tiene mañana según el día anotado.
	if (!only || only === "studies") {
		try {
			result.studies = await runStudyReminders(db, nicaraguaToday(now));
		} catch (error) {
			console.error("daily_study_reminders_failed", error);
		}
	}
	return result;
}

