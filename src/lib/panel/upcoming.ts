// «Mis asignaciones» de Mi Panel (próximas): solo lo que sigue, para no abrumar.
// - Reuniones: todo lo de la siguiente reunión de entre semana y de la siguiente de fin de semana (partes y acomodadores).
// - Discursos que da la persona en otra congregación: todos los de esta semana (o, si no hay, el siguiente).
// - «Salen este fin de semana» (quien administra los arreglos de discursos): todos los de esta semana.
// - Territorios a su cargo: todos los pendientes (cada uno tiene sus acciones). La salida de predicación que es solo sobre
//   sus territorios no se repite: su fecha y hora se agregan al territorio.
// - Todo lo demás (limpieza, predicación con la congregación o el grupo, predicación pública, pastoreo): solo el siguiente.
import { time12 } from "@/lib/export/builders/meetingDates";
import type { PanelAssignment } from "@/lib/queries/panel";

export interface UpcomingWindow {
	/** Hoy (AAAA-MM-DD). */
	today: string;
	/** Lunes y domingo de la semana en curso. */
	weekStart: string;
	weekEnd: string;
}

const inWeek = (a: PanelAssignment, w: UpcomingWindow) => a.date >= w.weekStart && a.date <= w.weekEnd;

/** Cuánto dura cada asignación con hora (minutos): la predicación unas 2 horas; la reunión, 1 h 45; la limpieza ligera, al terminar la reunión. */
const DURATION_MIN: Partial<Record<PanelAssignment["meetingType"], number>> = {
	preaching: 120,
	midweek: 105,
	weekend: 105,
	operational: 105,
	outgoing_talk: 105,
	cleaning: 135,
};

/** Ahora en hora de Nicaragua (UTC−6, sin horario de verano): fecha AAAA-MM-DD y minutos desde medianoche. */
export function nicaraguaNow(instant = new Date()): { date: string; minutes: number } {
	const local = new Date(instant.getTime() - 6 * 3600 * 1000);
	return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/**
 * ¿Ya pasó? Lo de días anteriores, sí; lo de hoy con hora, cuando ya terminó (hora + duración de su tipo); lo de hoy sin hora (o que dura
 * varios días, como la limpieza profunda) sigue siendo de hoy hasta que acabe el día.
 */
export function isOver(a: Pick<PanelAssignment, "date" | "dateEnd" | "time" | "meetingType">, now: { date: string; minutes: number }): boolean {
	const last = a.dateEnd ?? a.date;
	if (last < now.date) return true;
	if (last > now.date || a.dateEnd || !a.time) return false;
	const [h, m] = a.time.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return false;
	return now.minutes >= h * 60 + m + (DURATION_MIN[a.meetingType] ?? 0);
}

/**
 * Hora local (Nicaragua) en que la asignación deja de ser próxima, «AAAA-MM-DDTHH:MM»: la app y el widget de Android la quitan a esa hora
 * aunque no vuelvan a pedir Mi Panel. Solo para lo de un día con hora.
 */
export function untilOf(a: Pick<PanelAssignment, "date" | "dateEnd" | "time" | "meetingType">): string | undefined {
	if (a.dateEnd || !a.time) return undefined;
	const [h, m] = a.time.split(":").map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
	const end = new Date(`${a.date}T00:00:00Z`);
	end.setUTCMinutes(h * 60 + m + (DURATION_MIN[a.meetingType] ?? 0));
	return end.toISOString().slice(0, 16);
}

/** La salida que toca de un territorio pendiente: la primera que aún no termina (2 horas después de su hora). */
export function nextTerritorySession(
	sessions: { date: string; time: string }[] | undefined,
	now: { date: string; minutes: number },
): { date: string; time: string } | undefined {
	return [...(sessions ?? [])]
		.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
		.find((s) => !isOver({ date: s.date, time: s.time, meetingType: "preaching" }, now));
}

/** Un territorio pendiente sale en Mi Panel solo desde el día antes de su siguiente salida de predicación y hasta 2 horas después de
 * ella (luego se oculta hasta el día antes de la siguiente); sin salida programada no sale. `today` = AAAA-MM-DD (Nicaragua). */
export function territoryVisible(next: { date: string } | undefined, today: string): boolean {
	if (!next) return false;
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return next.date <= d.toISOString().slice(0, 10);
}

/** Recibe las próximas (ya filtradas por fecha) y deja solo lo que sigue de cada tipo, en orden de fecha. */
export function selectUpcoming(items: PanelAssignment[], w: UpcomingWindow): PanelAssignment[] {
	const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
	const out: PanelAssignment[] = [];

	// Territorios pendientes: todos. Las salidas cuyos territorios son todos suyos se funden en el territorio.
	const territories = sorted.filter((a) => a.meetingType === "territory").map((a) => ({ ...a }));
	const mine = new Map(territories.filter((t) => t.territory).map((t) => [t.territory!.territoryId, t]));
	const isCaptainSession = (a: PanelAssignment) =>
		a.meetingType === "preaching" && !!a.territoryIds?.length && a.territoryIds.every((id) => mine.has(id));
	for (const session of sorted.filter(isCaptainSession)) {
		for (const id of session.territoryIds!) {
			const t = mine.get(id)!;
			if (!t.nextSession) {
				t.nextSession = session.when ?? session.date;
				// El punto de salida de ese día (y su selector) pasa al territorio del capitán.
				if (session.detail) t.detail = session.detail;
				const choices = session.departureChoices?.filter((c) => c.territoryId === id);
				if (choices?.length) t.departureChoices = choices;
			}
		}
	}
	// El territorio del capitán se presenta como su predicación: «Predicación: 8:45 a. m. Territorio 4», y al tocarlo abre ese día.
	for (const t of territories) {
		const at = t.nextSessionAt;
		if (!at) {
			out.push(t);
			continue;
		}
		const session = sorted.find((a) => isCaptainSession(a) && a.date === at.date && a.time === at.time && a.territoryIds!.includes(t.territory!.territoryId));
		out.push({
			...t,
			label: `Predicación: ${session?.timeLabel ?? time12(at.time) ?? at.time} ${t.label}`,
			openDate: at.date,
			until: untilOf({ date: at.date, time: at.time, meetingType: "preaching" }),
		});
	}

	const rest = sorted.filter((a) => a.meetingType !== "territory" && !isCaptainSession(a));
	const byBucket = new Map<string, PanelAssignment[]>();
	for (const a of rest) {
		const key = a.bucket ?? a.meetingType;
		byBucket.set(key, [...(byBucket.get(key) ?? []), a]);
	}

	for (const [bucket, list] of byBucket) {
		if (bucket.startsWith("meeting:")) {
			// Todo lo de la siguiente reunión de ese tipo.
			out.push(...list.filter((a) => a.date === list[0].date));
		} else if (bucket === "outgoing_talk") {
			const thisWeek = list.filter((a) => inWeek(a, w));
			out.push(...(thisWeek.length ? thisWeek : list.slice(0, 1)));
		} else if (bucket === "talks_out") {
			out.push(...list.filter((a) => inWeek(a, w)));
		} else {
			out.push(list[0]);
		}
	}

	return out
		.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
		.map(({ bucket: _b, territoryIds: _t, when: _w, time: _time, nextSession: _n, sessions: _s, nextSessionAt: _a, timeLabel: _l, ...rest }) => {
			// La predicación (no la del capitán, que es un territorio) se muestra solo con su línea: «Predicación: hora territorio». El punto
			// de salida y las indicaciones se ven al tocarla (Calendario); el capitán sí los ve en su tarjeta.
			if (rest.meetingType === "preaching") delete rest.detail;
			const until = rest.until ?? untilOf({ ...rest, time: _time });
			return until ? { ...rest, until } : rest;
		});
}
