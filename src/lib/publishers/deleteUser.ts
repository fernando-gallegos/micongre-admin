// Borrar a una persona: muchas tablas la referencian sin ON DELETE (SQLite no permite cambiarlo sin rehacer la tabla), así que antes de
// borrarla se vacían las referencias opcionales (asignaciones de reuniones, encargados de grupo, comité de la congregación…). Si aún tiene
// registros a su nombre que no se pueden vaciar (informes que capturó, avisos que envió, es orador local, cuentas del salón…), se responde
// con un error claro en vez de un error interno: a esas personas se les marca como inactivas, no se borran.
//
// Todo va en UN lote de D1 (una transacción): si el borrado falla, las referencias vaciadas se deshacen y no se pierde nada.

/** Columnas opcionales que apuntan a users(id) sin ON DELETE (sacadas de src/db/schema): se ponen en NULL antes de borrar.
 * Si se agrega otra referencia opcional a users en el esquema, va aquí. (speakers.user_id NO: un orador local exige persona.) */
const NULLABLE_REFERENCES: [table: string, column: string][] = [
	["users", "guardian_user_id"],
	["user_privileges", "approved_by_user_id"],
	["midweek_meetings", "chairman_user_id"],
	["midweek_meetings", "opening_prayer_user_id"],
	["midweek_assignments", "main_assignee_id"],
	["midweek_assignments", "assistant_assignee_id"],
	["weekend_meetings", "chairman_user_id"],
	["weekend_meetings", "watchtower_conductor_id"],
	["weekend_meetings", "watchtower_reader_id"],
	["weekend_meetings", "prayer_user_id"],
	["operational_schedules", "assigned_user_id"],
	["field_service_groups", "overseer_user_id"],
	["field_service_groups", "assistant_user_id"],
	["meeting_attendance", "recorded_by_user_id"],
	["congregations", "cobe_user_id"],
	["congregations", "secretary_user_id"],
	["congregations", "service_overseer_user_id"],
	["cleaning_tasks", "completed_by_user_id"],
	["welcome_animations", "created_by_user_id"],
];

export class UserHasRecordsError extends Error {
	constructor() {
		super("user_has_records");
	}
}

export async function deleteUserClearingReferences(d1: D1Database, userId: string): Promise<void> {
	const statements = [
		...NULLABLE_REFERENCES.map(([table, column]) => d1.prepare(`UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" = ?`).bind(userId)),
		d1.prepare(`DELETE FROM "users" WHERE "id" = ?`).bind(userId),
	];
	try {
		await d1.batch(statements);
	} catch (error) {
		const text = `${(error as Error)?.message ?? error} ${String((error as { cause?: unknown })?.cause ?? "")}`;
		if (/FOREIGN KEY constraint failed|CHECK constraint failed/i.test(text)) throw new UserHasRecordsError();
		throw error;
	}
}
