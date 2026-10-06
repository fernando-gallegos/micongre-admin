import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations, refreshTokens, users } from "@/db/schema";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "@/lib/auth/constants";
import { signAccessToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/auth/tokens";
import { restoreBackup, wipeAllData, type RestoreResult } from "@/lib/backup/backup";
import type { SetupAdminInput, SetupCongregationInput } from "@/lib/validation/setup";
import {
	buildHourglassStatements,
	HOURGLASS_ROLLBACK_STATEMENTS,
	parseHourglassExport,
	summarizeHourglass,
	type HourglassImportStats,
} from "./hourglass";
import { buildNwsImport, NwsError, parseNwsFiles, type NwsStats } from "./nws";
import { getSetupStatus } from "./status";

// El asistente guarda cada paso al momento (migración → congregación → admin).
// El admin va al final a propósito: mientras no exista, `needsSetup` sigue en
// true y el asistente puede retomarse tras un fallo o un cierre de pestaña.

export type SetupFailure = {
	error: | "already_configured"
		| "database_not_empty"
		| "invalid_hourglass"
		| "import_failed"
		| "invalid_nws"
		| "username_taken"
		| "invalid_backup"
		| "restore_failed";
};

// D1 ejecuta cada batch como una transacción; se parte en lotes para no
// toparse con límites de tamaño en migraciones grandes (miles de informes).
const BATCH_SIZE = 50;

async function runStatements(d1: D1Database, statements: string[]) {
	for (let i = 0; i < statements.length; i += BATCH_SIZE) {
		await d1.batch(statements.slice(i, i + BATCH_SIZE).map((s) => d1.prepare(s)));
	}
}

/** Valida que el asistente siga abierto (no existe ningún admin). */
export async function assertSetupOpen(db: Database): Promise<SetupFailure | null> {
	const status = await getSetupStatus(db);
	return status.needsSetup ? null : { error: "already_configured" };
}

/** Migra publicadores, grupos, nombramientos, privilegios e informes desde un
 * export de Hourglass, y deja sus datos de congregación guardados para que el
 * paso siguiente los precargue. Solo sobre una base sin usuarios. */
export async function importHourglass(
	db: Database,
	d1: D1Database,
	raw: unknown,
): Promise<{ stats: HourglassImportStats } | SetupFailure> {
	const status = await getSetupStatus(db);
	if (!status.needsSetup) return { error: "already_configured" };
	if (status.userCount > 0) return { error: "database_not_empty" };

	const data = parseHourglassExport(raw);
	if (!data) return { error: "invalid_hourglass" };

	try {
		const { statements, stats } = buildHourglassStatements(data);
		await runStatements(d1, statements);

		const c = summarizeHourglass(data).congregation;
		await saveCongregation(db, {
			name: c.name,
			congregationNumber: c.congregationNumber || null,
			language: c.language || null,
			kingdomHallAddress: c.kingdomHallAddress || null,
			meetingSchedules: { midweek: c.midweek, weekend: c.weekend },
		});
		return { stats };
	} catch (error) {
		console.error("Hourglass import failed", error);
		await runStatements(d1, HOURGLASS_ROLLBACK_STATEMENTS).catch((e) => console.error("Rollback failed", e));
		return { error: "import_failed" };
	}
}

/** Migra desde los CSV de NWScheduler (ver lib/setup/nws): se reconocen por su
 * contenido, se cruzan entre sí y solo entonces se guarda todo. Solo sobre una
 * base sin usuarios; si algo falla se deshace. */
export async function importNws(
	db: Database,
	d1: D1Database,
	texts: string[],
): Promise<{ stats: NwsStats; warnings: string[] } | (SetupFailure & { message?: string })> {
	const status = await getSetupStatus(db);
	if (!status.needsSetup) return { error: "already_configured" };
	if (status.userCount > 0) return { error: "database_not_empty" };

	let built;
	try {
		built = buildNwsImport(parseNwsFiles(texts).bundle);
	} catch (error) {
		if (error instanceof NwsError) return { error: "invalid_nws", message: error.message };
		throw error;
	}

	try {
		await runStatements(d1, built.statements);
		// NWScheduler no trae los datos de la congregación; el nombre se deduce de
		// la lista de discursantes si se pudo (el resto se completa en el paso siguiente).
		if (built.congregationName) await saveCongregation(db, { name: built.congregationName });
		return { stats: built.stats, warnings: built.warnings };
	} catch (error) {
		console.error("NWScheduler import failed", error);
		await wipeAllData(d1).catch((e) => console.error("Rollback failed", e));
		return { error: "import_failed" };
	}
}

/** Restaura un respaldo de MiCongre (ver lib/backup) sobre una base sin usuarios.
 * Si el respaldo trae un administrador, el asistente queda cerrado: se entra con
 * las cuentas del respaldo. */
export async function restoreFromBackup(
	db: Database,
	d1: D1Database,
	raw: unknown,
): Promise<RestoreResult | SetupFailure> {
	const status = await getSetupStatus(db);
	if (!status.needsSetup) return { error: "already_configured" };
	if (status.userCount > 0) return { error: "database_not_empty" };
	return restoreBackup(d1, raw);
}

export interface SetupCongregation {
	name: string;
	congregationNumber: string;
	circuitId: string;
	language: string;
	kingdomHallAddress: string;
	isContactCongregation: boolean;
	midweek: { day: string; time: string } | null;
	weekend: { day: string; time: string } | null;
	preachingTime: string;
}

const PLACEHOLDER_NAME = "Mi congregación"; // valor sembrado por migrations/0014

/** Lo que ya hay guardado de la congregación (migración o paso previo). */
export async function getSetupCongregation(db: Database): Promise<SetupCongregation> {
	const [row] = await db.select().from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
	const schedules = row?.meetingSchedules ? JSON.parse(row.meetingSchedules) : null;
	return {
		name: row && row.name !== PLACEHOLDER_NAME ? row.name : "",
		congregationNumber: row?.congregationNumber ?? "",
		circuitId: row?.circuitId ?? "",
		language: row?.language ?? "",
		kingdomHallAddress: row?.kingdomHallAddress ?? "",
		isContactCongregation: row?.isContactCongregation ?? false,
		midweek: schedules?.midweek ?? null,
		weekend: schedules?.weekend ?? null,
		preachingTime: row?.preachingTime ?? "",
	};
}

export async function saveCongregation(db: Database, input: Partial<SetupCongregationInput> & { name: string }) {
	const { meetingSchedules, ...rest } = input;
	const values = {
		...rest,
		...(meetingSchedules !== undefined
			? { meetingSchedules: meetingSchedules ? JSON.stringify(meetingSchedules) : null }
			: {}),
		updatedAt: new Date(),
	};
	await db
		.insert(congregations)
		.values({ id: CONGREGATION_ROW_ID, ...values })
		.onConflictDoUpdate({ target: congregations.id, set: values });
}

/** Crea el super-administrador (oculto: no cuenta como publicador) y abre sesión. */
export async function createSetupAdmin(
	db: Database,
	d1: D1Database,
	jwtSecret: string,
	admin: SetupAdminInput,
): Promise<{ accessToken: string; refreshToken: string } | SetupFailure> {
	const closed = await assertSetupOpen(db);
	if (closed) return closed;

	const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, admin.username)).limit(1);
	if (taken) return { error: "username_taken" };

	const adminId = crypto.randomUUID();
	const passwordHash = await hashPassword(admin.password);
	// Inserción condicional: si otra petición ganó la carrera y ya hay un admin,
	// no se crea un segundo.
	const result = await d1
		.prepare(
			`INSERT INTO users (id, full_name, username, gender, theocratic_status, system_role, is_hidden_admin, account_status, password_hash, password_algo)
			 SELECT ?, ?, ?, 'male', 'baptized_publisher', 'admin', 1, 'active', ?, 'PBKDF2-SHA256'
			 WHERE NOT EXISTS (SELECT 1 FROM users WHERE system_role = 'admin')`,
		)
		.bind(adminId, admin.fullName, admin.username, passwordHash)
		.run();
	if (!result.meta.changes) return { error: "already_configured" };

	const accessToken = await signAccessToken(
		{ sub: adminId, role: "admin", privs: [], fullName: admin.fullName },
		jwtSecret,
		ACCESS_TOKEN_TTL_SECONDS,
	);
	const refreshToken = generateOpaqueToken();
	await db.insert(refreshTokens).values({
		userId: adminId,
		tokenHash: await hashOpaqueToken(refreshToken),
		clientType: "web",
		expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS.web * 1000),
	});

	return { accessToken, refreshToken };
}
