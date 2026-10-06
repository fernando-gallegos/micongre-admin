// Migración desde Hourglass para el asistente de configuración inicial.
// Es el mismo mapeo que scripts/import-hourglass.mjs (mantenerlos alineados),
// pero corre dentro de la app: el navegador lee el JSON y muestra el resumen
// (parseHourglassExport / summarizeHourglass), y el servidor genera el SQL de
// inserción (buildHourglassStatements) al finalizar el asistente.
//
// Igual que el script: no importa contraseñas ni cuentas (todo publicador
// queda 'no_account'), ni territorios, asistencia, etiquetas ni roles sin
// equivalente claro — ver la cabecera del script para la lista completa.
// Los datos de la congregación NO se importan aquí: el asistente los precarga
// en su paso "Datos de congregación" (summary.congregation) y se guardan ahí.

interface HgPerson {
	firstname?: string | null;
	middlename?: string | null;
	lastname?: string | null;
	sex?: string | null;
	birth?: string | null;
	baptism?: string | null;
	email?: string | null;
	cellphone?: string | null;
	homephone?: string | null;
	otherphone?: string | null;
	status?: string | null;
	appt?: string | null;
}

interface HgPublisher extends HgPerson {
	id: number;
	loginemail?: string | null;
	group_id?: number | null;
}

interface HgNotPublisher extends HgPerson {
	users_id: number;
	created_at?: string | null;
	npreason?: string | null;
}

interface HgGroup {
	id: number;
	name: string;
	overseer_id?: number | null;
	assistant_id?: number | null;
}

interface HgReport {
	user: { id: number };
	reported_by?: number | null;
	year: number;
	month: number;
	minutes?: number | null;
	minutes_as_hours?: string | null;
	studies?: number | null;
	credithours?: number | string | null;
	remarks?: string | null;
	reported_at?: string | null;
	submitted_month?: string | null;
	pioneer?: string | null;
}

export interface HourglassExport {
	congregation: {
		name: string;
		number?: string | number | null;
		address?: string | null;
		locale?: { name?: string | null } | null;
		mmdow?: number | null;
		mmtime?: string | null;
		wmdow?: number | null;
		wmtime?: string | null;
		last_updated?: string | null;
	};
	publishers: HgPublisher[];
	notPublishers: HgNotPublisher[];
	fsGroups: HgGroup[];
	privileges: Record<string, number[]>;
	reports: HgReport[];
}

const WEEKDAY_ES: Record<number, string> = {
	1: "Lunes",
	2: "Martes",
	3: "Miércoles",
	4: "Jueves",
	5: "Viernes",
	6: "Sábado",
	7: "Domingo",
};

function hhmm(t?: string | null): string | null {
	return t ? t.slice(0, 5) : null;
}

/** Valida la forma mínima del export; devuelve null si no parece uno de Hourglass. */
export function parseHourglassExport(raw: unknown): HourglassExport | null {
	if (!raw || typeof raw !== "object") return null;
	const d = raw as Partial<HourglassExport>;
	if (!d.congregation || typeof d.congregation !== "object" || typeof d.congregation.name !== "string") return null;
	if (!Array.isArray(d.publishers)) return null;
	return {
		congregation: d.congregation,
		publishers: d.publishers,
		notPublishers: Array.isArray(d.notPublishers) ? d.notPublishers : [],
		fsGroups: Array.isArray(d.fsGroups) ? d.fsGroups : [],
		privileges: d.privileges && typeof d.privileges === "object" ? d.privileges : {},
		reports: Array.isArray(d.reports) ? d.reports : [],
	};
}

export interface HourglassSummary {
	congregation: {
		name: string;
		congregationNumber: string;
		kingdomHallAddress: string;
		language: string;
		midweek: { day: string; time: string } | null;
		weekend: { day: string; time: string } | null;
	};
	counts: { publishers: number; notPublishers: number; groups: number; reports: number };
}

export function summarizeHourglass(data: HourglassExport): HourglassSummary {
	const c = data.congregation;
	return {
		congregation: {
			name: c.name,
			congregationNumber: c.number != null ? String(c.number) : "",
			kingdomHallAddress: c.address?.trim() ?? "",
			language: c.locale?.name ?? "",
			midweek: c.mmdow && c.mmtime ? { day: WEEKDAY_ES[c.mmdow] ?? "", time: hhmm(c.mmtime) ?? "" } : null,
			weekend: c.wmdow && c.wmtime ? { day: WEEKDAY_ES[c.wmdow] ?? "", time: hhmm(c.wmtime) ?? "" } : null,
		},
		counts: {
			publishers: data.publishers.length,
			notPublishers: data.notPublishers.length,
			groups: data.fsGroups.length,
			reports: data.reports.length,
		},
	};
}

// ---------------------------------------------------------------------------
// Generación de SQL (solo servidor)
// ---------------------------------------------------------------------------

export function sqlStr(value: unknown): string {
	if (value === null || value === undefined || value === "") return "NULL";
	// SQLite no interpreta escapes con barra invertida dentro de literales:
	// duplicar la comilla simple basta (y se descartan los NUL).
	return `'${String(value).replace(/\0/g, "").replace(/'/g, "''")}'`;
}
export function sqlNum(value: unknown): string {
	return typeof value === "number" && Number.isFinite(value) ? String(value) : "NULL";
}
export function sqlBool(value: unknown): string {
	return value ? "1" : "0";
}
export function dateOnly(value?: string | null): string | null {
	return value ? String(value).split("T")[0] : null;
}
export function unixEpoch(value?: string | null): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
function fullName(p: HgPerson): string {
	return [p.firstname, p.middlename, p.lastname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function pickPhone(p: HgPerson): string | null {
	return p.cellphone || p.homephone || p.otherphone || null;
}
export function isMinor(birthDate: string | null, asOf: string | null): boolean {
	if (!birthDate || !asOf) return false;
	const birth = new Date(birthDate);
	const ref = new Date(asOf);
	let age = ref.getFullYear() - birth.getFullYear();
	const m = ref.getMonth() - birth.getMonth();
	if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
	return age < 18;
}

/** INSERT multi-fila en trozos — D1 limita el tamaño de cada sentencia. */
export function insertMany(table: string, columns: string[], rows: string[][], chunkSize = 40): string[] {
	const statements: string[] = [];
	for (let i = 0; i < rows.length; i += chunkSize) {
		const values = rows
			.slice(i, i + chunkSize)
			.map((r) => `(${r.join(", ")})`)
			.join(",\n");
		statements.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${values};`);
	}
	return statements;
}

const THEO_STATUS: Record<string, string> = {
	StudentOnly: "student",
	"Unbaptized Publisher": "unbaptized_publisher",
	"Baptized Publisher": "baptized_publisher",
	"Regular Pioneer": "baptized_publisher",
	"Continuous Auxiliary Pioneer": "baptized_publisher",
};

// Clave(s) de Hourglass → id(s) de nuestro catálogo (migrations/0005).
const PRIVILEGE_MAP: Array<[string[], string[]]> = [
	[["mm_chairman"], ["priv_midweek_chairman"]],
	[["wm_chairman"], ["priv_weekend_chairman"]],
	[["treasures"], ["priv_treasures_talk"]],
	[["dfg"], ["priv_spiritual_gems"]],
	[["reading"], ["priv_bible_reading"]],
	[["stutalk"], ["priv_student_assignment"]],
	[["localneeds"], ["priv_congregation_needs"]],
	[["cbs"], ["priv_cbs_conductor"]],
	[["cbs_reader"], ["priv_cbs_reader"]],
	[["pt", "pt_out"], ["priv_public_talk_speaker"]],
	[["wm_reader"], ["priv_watchtower_reader"]],
	[["wt_conductor"], ["priv_watchtower_conductor"]],
	[["mics"], ["priv_mic_1", "priv_mic_2"]],
	[["console"], ["priv_audio_console"]],
	[["video", "zoom_attendant", "stream"], ["priv_video_zoom"]],
	[["stage"], ["priv_platform"]],
];

export interface HourglassImportStats {
	publishers: number;
	inactive: number;
	groups: number;
	appointments: number;
	privileges: number;
	reports: number;
	reportsSkipped: number;
}

/** Sentencias SQL, en orden de ejecución, que cargan publicadores, grupos,
 * nombramientos, privilegios e informes, más el conteo de lo que se cargará.
 * Todas las tablas destino deben estar vacías (lo garantiza importHourglass). */
export function buildHourglassStatements(data: HourglassExport): { statements: string[]; stats: HourglassImportStats } {
	const importDate = dateOnly(data.congregation.last_updated) ?? dateOnly(new Date().toISOString());
	const importNote = `Importado de Hourglass el ${importDate}; fecha de inicio real desconocida.`;

	const userIdMap = new Map<number, string>();
	for (const p of data.publishers) userIdMap.set(p.id, crypto.randomUUID());
	for (const np of data.notPublishers) userIdMap.set(np.users_id, crypto.randomUUID());
	const groupIdMap = new Map<number, string>();
	for (const g of data.fsGroups) groupIdMap.set(g.id, crypto.randomUUID());

	const notPublisherIds = new Set(data.notPublishers.map((np) => np.users_id));

	// 1. Usuarios (sin grupo todavía: los grupos referencian usuarios, así que
	//    el grupo se asigna después de crearlos).
	const userRows: string[][] = [];
	const pendingGroupAssignment: Array<{ userId: string; hgGroupId: number }> = [];

	function addUser(hgId: number, p: HgPerson, groupId: number | null | undefined, email: string | null | undefined) {
		const id = userIdMap.get(hgId)!;
		const birthDate = dateOnly(p.birth);
		if (groupId != null) pendingGroupAssignment.push({ userId: id, hgGroupId: groupId });
		userRows.push([
			sqlStr(id),
			sqlStr(fullName(p) || "Sin nombre"),
			sqlStr(email),
			sqlStr(pickPhone(p)),
			sqlStr(birthDate),
			sqlStr(dateOnly(p.baptism)),
			sqlStr(p.sex === "Female" ? "female" : "male"),
			sqlStr(notPublisherIds.has(hgId) ? "inactive" : "active"),
			sqlStr(THEO_STATUS[p.status ?? ""] ?? "baptized_publisher"),
			sqlBool(isMinor(birthDate, importDate)),
			"'regular'",
			"'no_account'",
			"1",
		]);
	}
	for (const p of data.publishers) addUser(p.id, p, p.group_id, p.email || p.loginemail || null);
	for (const np of data.notPublishers) addUser(np.users_id, np, null, np.email);

	const statements = insertMany(
		"users",
		[
			"id",
			"full_name",
			"email",
			"phone",
			"birth_date",
			"baptism_date",
			"gender",
			"congregation_status",
			"theocratic_status",
			"is_minor",
			"system_role",
			"account_status",
			"active",
		],
		userRows,
	);

	// 2. Grupos de predicación
	statements.push(
		...insertMany(
			"field_service_groups",
			["id", "name", "overseer_user_id", "assistant_user_id", "active"],
			data.fsGroups.map((g) => [
				sqlStr(groupIdMap.get(g.id)),
				sqlStr(g.name),
				sqlStr(g.overseer_id != null ? (userIdMap.get(g.overseer_id) ?? null) : null),
				sqlStr(g.assistant_id != null ? (userIdMap.get(g.assistant_id) ?? null) : null),
				"1",
			]),
		),
	);
	for (const { userId, hgGroupId } of pendingGroupAssignment) {
		const groupId = groupIdMap.get(hgGroupId);
		if (groupId) {
			statements.push(`UPDATE users SET field_service_group_id = ${sqlStr(groupId)} WHERE id = ${sqlStr(userId)};`);
		}
	}

	// 3. Nombramientos teocráticos
	const appointmentRows: string[][] = [];
	function addAppointment(userId: string, type: string, endDate: string | null, notes: string) {
		appointmentRows.push([sqlStr(crypto.randomUUID()), sqlStr(userId), sqlStr(type), sqlStr(importDate), sqlStr(endDate), sqlStr(notes)]);
	}
	function addPersonAppointments(
		hgId: number,
		p: HgPerson,
		departed?: { on: string | null; reason: string | null | undefined },
	) {
		const userId = userIdMap.get(hgId)!;
		const endDate = departed ? departed.on : null;
		const departedNote = departed
			? ` Ya no está activo en esta congregación (motivo Hourglass: ${departed.reason === "df" ? "desasociación/expulsión" : "mudanza"}).`
			: "";
		const note = importNote + departedNote;
		if (p.appt === "Elder") addAppointment(userId, "elder", endDate, note);
		if (p.appt === "MS") addAppointment(userId, "ministerial_servant", endDate, note);
		if (p.status === "Regular Pioneer") addAppointment(userId, "regular_pioneer", endDate, note);
		if (p.status === "Continuous Auxiliary Pioneer") {
			addAppointment(
				userId,
				"auxiliary_pioneer",
				endDate,
				`Precursorado auxiliar continuo (Hourglass: "Continuous Auxiliary Pioneer"). ${note}`,
			);
		}
	}
	for (const p of data.publishers) addPersonAppointments(p.id, p);
	for (const np of data.notPublishers) {
		addPersonAppointments(np.users_id, np, { on: dateOnly(np.created_at), reason: np.npreason });
	}
	for (const g of data.fsGroups) {
		if (g.overseer_id != null && userIdMap.has(g.overseer_id)) {
			addAppointment(userIdMap.get(g.overseer_id)!, "field_service_group_overseer", null, `Supervisor de ${g.name}. ${importNote}`);
		}
		if (g.assistant_id != null && g.assistant_id !== g.overseer_id && userIdMap.has(g.assistant_id)) {
			addAppointment(userIdMap.get(g.assistant_id)!, "field_service_group_assistant", null, `Auxiliar de ${g.name}. ${importNote}`);
		}
	}
	statements.push(
		...insertMany(
			"theocratic_appointments",
			["id", "user_id", "appointment_type", "start_date", "end_date", "notes"],
			appointmentRows,
		),
	);

	// 4. Privilegios elegibles (solo roles con equivalencia clara)
	const grantRows: string[][] = [];
	const granted = new Set<string>();
	for (const [hgKeys, privIds] of PRIVILEGE_MAP) {
		const hgIds = new Set<number>();
		for (const key of hgKeys) for (const id of data.privileges[key] ?? []) hgIds.add(id);
		for (const hgId of hgIds) {
			const userId = userIdMap.get(hgId);
			if (!userId) continue;
			for (const privId of privIds) {
				const key = `${userId}|${privId}`;
				if (granted.has(key)) continue;
				granted.add(key);
				grantRows.push([sqlStr(crypto.randomUUID()), sqlStr(userId), sqlStr(privId), sqlStr(importDate), "1"]);
			}
		}
	}
	statements.push(...insertMany("user_privileges", ["id", "user_id", "privilege_id", "approved_at", "active"], grantRows));

	// 5. Informes de servicio (S-4/S-21)
	const reportRows: string[][] = [];
	for (const r of data.reports) {
		const userId = userIdMap.get(r.user?.id);
		if (!userId) continue;
		const enteredBy = (r.reported_by != null ? userIdMap.get(r.reported_by) : undefined) ?? userId;
		// "1 minuto" es el marcador de Hourglass para "participó sin llevar
		// horas": se lleva a 0, no a 0.02 (ver migración 0038).
		const hours =
			r.minutes != null
				? r.minutes <= 1
					? 0
					: Math.round((r.minutes / 60) * 100) / 100
				: r.minutes_as_hours
					? Number.parseFloat(r.minutes_as_hours)
					: null;
		const participated = (r.minutes ?? 0) > 0 || (r.studies ?? 0) > 0;
		let status = "submitted";
		if (r.submitted_month) {
			const [sy, sm] = r.submitted_month.split("-").map(Number);
			if (sy !== r.year || sm !== r.month) status = "late";
		}
		reportRows.push([
			sqlStr(crypto.randomUUID()),
			sqlStr(userId),
			sqlStr(enteredBy),
			sqlNum(r.year),
			sqlNum(r.month),
			sqlBool(participated),
			sqlBool(r.pioneer === "Auxiliary"),
			sqlNum(hours),
			sqlNum(r.studies ?? 0),
			r.credithours != null ? sqlStr(`Crédito: ${r.credithours}`) : "NULL",
			sqlStr(r.remarks),
			sqlNum(unixEpoch(r.reported_at)),
			sqlStr(status),
		]);
	}
	statements.push(
		...insertMany(
			"service_reports",
			[
				"id",
				"user_id",
				"entered_by_user_id",
				"period_year",
				"period_month",
				"participated_in_ministry",
				"is_auxiliary_pioneer_this_month",
				"hours",
				"bible_studies_count",
				"credit_hours_note",
				"comments",
				"submitted_at",
				"status",
			],
			reportRows,
		),
	);

	return {
		statements,
		stats: {
			publishers: data.publishers.length,
			inactive: data.notPublishers.length,
			groups: data.fsGroups.length,
			appointments: appointmentRows.length,
			privileges: grantRows.length,
			reports: reportRows.length,
			reportsSkipped: data.reports.length - reportRows.length,
		},
	};
}

/** Deshace una migración a medias. Solo es seguro porque importHourglass exige
 * que estas tablas estén vacías antes de importar: todo lo que haya es nuestro. */
export const HOURGLASS_ROLLBACK_STATEMENTS = [
	"UPDATE users SET field_service_group_id = NULL;",
	"DELETE FROM service_reports;",
	"DELETE FROM user_privileges;",
	"DELETE FROM theocratic_appointments;",
	"DELETE FROM field_service_groups;",
	"DELETE FROM users;",
];
