import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import { serviceReports, users } from "@/db/schema";
import { sendPushes } from "@/lib/push/dispatch";
import { notHiddenAdmin } from "@/lib/rbac/visibility";

/** Hora de Nicaragua (UTC−6, sin horario de verano). */
const NICARAGUA_OFFSET_HOURS = -6;

export interface ReportReminderResult {
	/** Mes del informe que se recuerda (AAAA-MM). */
	month: string;
	monthName: string;
	/** Publicadores con cuenta que todavía no lo enviaron. */
	pending: number;
	/** Pushes que salieron (solo llegan a quien tiene la app o el navegador suscrito). */
	pushes: number;
}

/** Nombre del mes en español ("septiembre"). */
function monthName(year: number, month: number): string {
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("es", { month: "long", timeZone: "UTC" });
}

/** Recordatorio del informe de servicio del mes anterior: cada día (lo dispara el Job diario) avisa por push, con un mensaje amistoso,
 * a cada publicador que todavía no lo envió. Quien ya lo envió no recibe nada. Cuenta como enviado cualquier informe del mes (aunque
 * diga que no salió a predicar) que no esté marcado "no enviado". Reciben el aviso las personas activas con cuenta, de estado
 * "activo" en la congregación y que no son estudiantes (los estudiantes todavía no informan). */
export async function runReportReminders(db: Database, now = new Date()): Promise<ReportReminderResult> {
	const local = new Date(now.getTime() + NICARAGUA_OFFSET_HOURS * 3_600_000);
	const thisMonth = local.getUTCMonth() + 1; // 1-12
	const year = thisMonth === 1 ? local.getUTCFullYear() - 1 : local.getUTCFullYear();
	const month = thisMonth === 1 ? 12 : thisMonth - 1;
	const name = monthName(year, month);
	const result: ReportReminderResult = { month: `${year}-${String(month).padStart(2, "0")}`, monthName: name, pending: 0, pushes: 0 };

	const [publishers, sent] = await Promise.all([
		db
			.select({ id: users.id })
			.from(users)
			.where(
				and(
					eq(users.accountStatus, "active"),
					eq(users.active, true),
					eq(users.congregationStatus, "active"),
					ne(users.theocraticStatus, "student"),
					notHiddenAdmin,
				),
			),
		db
			.select({ userId: serviceReports.userId })
			.from(serviceReports)
			.where(and(eq(serviceReports.periodYear, year), eq(serviceReports.periodMonth, month), ne(serviceReports.status, "not_submitted"))),
	]);
	const done = new Set(sent.map((r) => r.userId));
	const pending = publishers.filter((p) => !done.has(p.id));
	result.pending = pending.length;
	if (pending.length === 0) return result;

	const payload = {
		title: `Tu informe de ${name}`,
		body: `¡Hola! Todavía falta tu informe de ${name}. Solo toma un minuto: envíalo cuando puedas. ¡Gracias por tu servicio!`,
		url: "/panel",
	};
	result.pushes = await sendPushes(db, pending.map((p) => ({ userId: p.id, payload })));
	return result;
}
