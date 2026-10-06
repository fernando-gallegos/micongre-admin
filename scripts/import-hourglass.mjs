#!/usr/bin/env node
// Genera un script SQL a partir de un export JSON de Hourglass para importar
// publicadores, grupos de predicación, nombramientos, privilegios elegibles
// e historial de informes S-4 a nuestra base de datos.
//
// Uso:
//   node scripts/import-hourglass.mjs "ruta/al/export.json" [salida.sql]
//
// El archivo generado (por defecto scripts/hourglass-import.sql) es un SQL
// plano que se corre con:
//   npx wrangler d1 execute DB --remote --file=./scripts/hourglass-import.sql
//
// No toca contraseñas ni cuentas de login: todo publicador importado queda
// con username/password_hash NULL y account_status='no_account', igual que
// cualquier publicador nuevo — el acceso se otorga después con el enlace de
// activación (ver AccessPanel.tsx / docs/mobile-activation-protocol.md).
//
// Qué NO importa (sin tabla o columna destino en nuestro esquema):
//   - territories / territoryRecords (no hay módulo de territorios)
//   - attendance (son totales mensuales agregados; meeting_attendance en
//     nuestro esquema es por reunión puntual, no hay forma de mapear sin
//     inventar fechas de reunión)
//   - tags (p. ej. "keyholder")
//   - los roles de Hourglass sin equivalente claro en nuestro catálogo de
//     privilegios: attendant, hh, security_attendant, cleaning, initcall,
//     rv, study, openprayer, closeprayer, prayer, conductFS, fm_discussion,
//     lac, interpreter, host, publicMinistry, fs_assistant, chairman
//     (genérico, duplicado de mm_chairman), chairman2, chairman3,
//     aux_chairman, none
//   - placements/videoshowings/returnvisits de los informes (ya no forman
//     parte del S-4 actual)
//   - npreason de notPublishers (motivo de baja: "moved"/"df") no tiene
//     columna en `users` — esos publicadores quedan como congregation_status
//     'inactive' sin distinguir el motivo.

import fs from "node:fs";
import crypto from "node:crypto";

const [, , inputPath, outputPathArg] = process.argv;
if (!inputPath) {
	console.error('Uso: node scripts/import-hourglass.mjs "ruta/al/export.json" [salida.sql]');
	process.exit(1);
}
const outputPath = outputPathArg || "scripts/hourglass-import.sql";

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sqlStr(value) {
	if (value === null || value === undefined || value === "") return "NULL";
	return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlNum(value) {
	if (value === null || value === undefined || Number.isNaN(value)) return "NULL";
	return String(value);
}
function sqlBool(value) {
	return value ? "1" : "0";
}
function dateOnly(value) {
	if (!value) return null;
	return String(value).split("T")[0];
}
function unixEpoch(value) {
	if (!value) return null;
	return Math.floor(Date.parse(value) / 1000);
}
function fullName(p) {
	return [p.firstname, p.middlename, p.lastname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function pickPhone(p) {
	return p.cellphone || p.homephone || p.otherphone || null;
}
function isMinor(birthDate, asOf) {
	if (!birthDate) return false;
	const birth = new Date(birthDate);
	const ref = new Date(asOf);
	let age = ref.getFullYear() - birth.getFullYear();
	const m = ref.getMonth() - birth.getMonth();
	if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
	return age < 18;
}

const IMPORT_NOTE_DATE = dateOnly(data.congregation.last_updated) || dateOnly(new Date().toISOString());
const IMPORT_NOTE = `Importado de Hourglass el ${IMPORT_NOTE_DATE}; fecha de inicio real desconocida.`;

const WEEKDAY_ES = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" };
function hhmm(t) {
	return t ? t.slice(0, 5) : null;
}

const out = [];
out.push(`-- Generado por scripts/import-hourglass.mjs a partir de ${inputPath}`);
out.push(`-- Congregación: ${data.congregation.name} (#${data.congregation.number})`);
out.push(`-- Publicadores: ${data.publishers.length}, no-publicadores: ${data.notPublishers.length}, grupos: ${data.fsGroups.length}, informes: ${data.reports.length}`);
out.push("");

// ---------------------------------------------------------------------------
// 1. Congregación (fila única 'main')
// ---------------------------------------------------------------------------

const meetingSchedules = {
	midweek:
		data.congregation.mmdow && data.congregation.mmtime
			? { day: WEEKDAY_ES[data.congregation.mmdow], time: hhmm(data.congregation.mmtime) }
			: null,
	weekend:
		data.congregation.wmdow && data.congregation.wmtime
			? { day: WEEKDAY_ES[data.congregation.wmdow], time: hhmm(data.congregation.wmtime) }
			: null,
};

out.push("-- Paso 1: datos institucionales de la congregación --------------------------");
out.push(
	`UPDATE congregations SET ` +
		`congregation_number = ${sqlStr(data.congregation.number)}, ` +
		`name = ${sqlStr(data.congregation.name)}, ` +
		`kingdom_hall_address = ${sqlStr(data.congregation.address?.trim())}, ` +
		`language = ${sqlStr(data.congregation.locale?.name)}, ` +
		`meeting_schedules = ${sqlStr(JSON.stringify(meetingSchedules))} ` +
		`WHERE id = 'main';`,
);
out.push("");

// ---------------------------------------------------------------------------
// 2. Usuarios (publishers + notPublishers)
// ---------------------------------------------------------------------------

const userIdMap = new Map(); // hourglass id -> our uuid
for (const p of data.publishers) userIdMap.set(p.id, crypto.randomUUID());
for (const np of data.notPublishers) userIdMap.set(np.users_id, crypto.randomUUID());

const groupIdMap = new Map(); // hourglass fsGroup id -> our uuid
for (const g of data.fsGroups) groupIdMap.set(g.id, crypto.randomUUID());

const THEO_STATUS = {
	StudentOnly: "student",
	"Unbaptized Publisher": "unbaptized_publisher",
	"Baptized Publisher": "baptized_publisher",
	"Regular Pioneer": "baptized_publisher",
	"Continuous Auxiliary Pioneer": "baptized_publisher",
};

out.push("-- Paso 2: usuarios (sin grupo todavía — field_service_groups referencia");
out.push("-- usuarios como supervisor/auxiliar, así que el grupo se asigna en el paso 3b");
out.push("-- una vez que la fila del grupo ya existe).");

const pendingGroupAssignment = []; // { userId, hgGroupId }

function userInsert(hgId, { firstname, lastname, middlename, sex, birth, baptism, email, cellphone, homephone, otherphone, status, group_id }) {
	const id = userIdMap.get(hgId);
	const theoStatus = THEO_STATUS[status] ?? "baptized_publisher";
	const gender = sex === "Female" ? "female" : "male";
	const birthDate = dateOnly(birth);
	const congStatus = data.notPublishers.some((np) => np.users_id === hgId) ? "inactive" : "active";
	if (group_id != null) pendingGroupAssignment.push({ userId: id, hgGroupId: group_id });
	out.push(
		`INSERT INTO users (id, full_name, email, phone, birth_date, baptism_date, gender, congregation_status, theocratic_status, is_minor, field_service_group_id, system_role, account_status, active) VALUES (` +
			`${sqlStr(id)}, ${sqlStr(fullName({ firstname, middlename, lastname }))}, ` +
			`${sqlStr(email)}, ${sqlStr(pickPhone({ cellphone, homephone, otherphone }))}, ${sqlStr(birthDate)}, ${sqlStr(dateOnly(baptism))}, ` +
			`${sqlStr(gender)}, ${sqlStr(congStatus)}, ${sqlStr(theoStatus)}, ${sqlBool(isMinor(birthDate, IMPORT_NOTE_DATE))}, ` +
			`NULL, 'regular', 'no_account', 1);`,
	);
}

for (const p of data.publishers) {
	userInsert(p.id, {
		firstname: p.firstname,
		lastname: p.lastname,
		middlename: p.middlename,
		sex: p.sex,
		birth: p.birth,
		baptism: p.baptism,
		email: p.email || p.loginemail || null,
		cellphone: p.cellphone,
		homephone: p.homephone,
		otherphone: p.otherphone,
		status: p.status,
		group_id: p.group_id,
	});
}
for (const np of data.notPublishers) {
	userInsert(np.users_id, {
		firstname: np.firstname,
		lastname: np.lastname,
		middlename: np.middlename,
		sex: np.sex,
		birth: np.birth,
		baptism: np.baptism,
		email: np.email,
		cellphone: np.cellphone,
		homephone: np.homephone,
		otherphone: np.otherphone,
		status: np.status,
		group_id: null,
	});
}
out.push("");

// ---------------------------------------------------------------------------
// 3. Grupos de predicación
// ---------------------------------------------------------------------------

out.push("-- Paso 3: grupos de predicación -----------------------------------------------");
for (const g of data.fsGroups) {
	const id = groupIdMap.get(g.id);
	const overseerId = g.overseer_id != null ? userIdMap.get(g.overseer_id) ?? null : null;
	const assistantId = g.assistant_id != null ? userIdMap.get(g.assistant_id) ?? null : null;
	out.push(
		`INSERT INTO field_service_groups (id, name, overseer_user_id, assistant_user_id, active) VALUES (` +
			`${sqlStr(id)}, ${sqlStr(g.name)}, ${sqlStr(overseerId)}, ${sqlStr(assistantId)}, 1);`,
	);
}
out.push("");

out.push("-- Paso 3b: asignar el grupo a cada usuario, ahora que los grupos ya existen ----");
for (const { userId, hgGroupId } of pendingGroupAssignment) {
	const groupId = groupIdMap.get(hgGroupId);
	if (!groupId) continue;
	out.push(`UPDATE users SET field_service_group_id = ${sqlStr(groupId)} WHERE id = ${sqlStr(userId)};`);
}
out.push("");

// ---------------------------------------------------------------------------
// 4. Nombramientos teocráticos (elder/ms, precursorado, supervisor/auxiliar de grupo)
// ---------------------------------------------------------------------------

out.push("-- Paso 4: nombramientos teocráticos --------------------------------------------");

function appointmentInsert(userId, appointmentType, { endDate = null, notes = null } = {}) {
	out.push(
		`INSERT INTO theocratic_appointments (id, user_id, appointment_type, start_date, end_date, notes) VALUES (` +
			`${sqlStr(crypto.randomUUID())}, ${sqlStr(userId)}, ${sqlStr(appointmentType)}, ${sqlStr(IMPORT_NOTE_DATE)}, ${sqlStr(endDate)}, ${sqlStr(notes)});`,
	);
}

function appointmentsForPublisher(hgId, { appt, status }, { departed = false, departedOn = null, npreason = null } = {}) {
	const userId = userIdMap.get(hgId);
	const endDate = departed ? departedOn : null;
	const departedNote = departed
		? ` Ya no está activo en esta congregación (motivo Hourglass: ${npreason === "df" ? "desasociación/expulsión" : "mudanza"}).`
		: "";
	if (appt === "Elder") appointmentInsert(userId, "elder", { endDate, notes: IMPORT_NOTE + departedNote });
	if (appt === "MS") appointmentInsert(userId, "ministerial_servant", { endDate, notes: IMPORT_NOTE + departedNote });
	if (status === "Regular Pioneer") appointmentInsert(userId, "regular_pioneer", { endDate, notes: IMPORT_NOTE + departedNote });
	if (status === "Continuous Auxiliary Pioneer")
		appointmentInsert(userId, "auxiliary_pioneer", {
			endDate,
			notes: `Precursorado auxiliar continuo (Hourglass: "Continuous Auxiliary Pioneer"). ${IMPORT_NOTE}${departedNote}`,
		});
}

for (const p of data.publishers) appointmentsForPublisher(p.id, p);
for (const np of data.notPublishers)
	appointmentsForPublisher(np.users_id, np, { departed: true, departedOn: dateOnly(np.created_at), npreason: np.npreason });

for (const g of data.fsGroups) {
	if (g.overseer_id != null) {
		appointmentInsert(userIdMap.get(g.overseer_id), "field_service_group_overseer", {
			notes: `Supervisor de ${g.name}. ${IMPORT_NOTE}`,
		});
	}
	if (g.assistant_id != null && g.assistant_id !== g.overseer_id) {
		appointmentInsert(userIdMap.get(g.assistant_id), "field_service_group_assistant", {
			notes: `Auxiliar de ${g.name}. ${IMPORT_NOTE}`,
		});
	}
}
out.push("");

// ---------------------------------------------------------------------------
// 5. Privilegios (roles de reunión/operativos con equivalencia clara)
// ---------------------------------------------------------------------------

out.push("-- Paso 5: privilegios (solo roles con equivalencia clara, ver cabecera) --------");

// Cada entrada: lista de claves de Hourglass -> uno o más ids de nuestro catálogo.
// Cuando varias claves de Hourglass mapean al mismo privilegio, se unifican
// (un publicador no recibe el mismo privilegio dos veces).
const PRIVILEGE_MAP = [
	[["mm_chairman"], ["priv_midweek_chairman"]],
	[["wm_chairman"], ["priv_weekend_chairman"]],
	[["treasures"], ["priv_treasures_talk"]],
	[["dfg"], ["priv_spiritual_gems"]], // "Digging for Gems" = Perlas escondidas
	[["reading"], ["priv_bible_reading"]],
	[["stutalk"], ["priv_student_assignment"]], // "Student talk" (Escuela)
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

const grants = new Map(); // `${userId}|${privilegeId}` -> true
for (const [hgKeys, privIds] of PRIVILEGE_MAP) {
	const hgIds = new Set();
	for (const key of hgKeys) for (const id of data.privileges[key] ?? []) hgIds.add(id);
	for (const hgId of hgIds) {
		const userId = userIdMap.get(hgId);
		if (!userId) continue;
		for (const privId of privIds) {
			const grantKey = `${userId}|${privId}`;
			if (grants.has(grantKey)) continue;
			grants.set(grantKey, true);
			out.push(
				`INSERT INTO user_privileges (id, user_id, privilege_id, approved_at, active) VALUES (` +
					`${sqlStr(crypto.randomUUID())}, ${sqlStr(userId)}, ${sqlStr(privId)}, ${sqlStr(IMPORT_NOTE_DATE)}, 1);`,
			);
		}
	}
}
out.push("");

// ---------------------------------------------------------------------------
// 6. Informes de servicio (S-4/S-21)
// ---------------------------------------------------------------------------

out.push("-- Paso 6: historial de informes de servicio ------------------------------------");
for (const r of data.reports) {
	const userId = userIdMap.get(r.user.id);
	const enteredBy = userIdMap.get(r.reported_by) ?? userId;
	if (!userId) continue;
	// Hourglass usa "1 minuto" como marcador de "participó pero no llevó
	// horas" (típico de un no precursor) — sin este piso, round(1/60*100)/100
	// da 0.02 horas fantasma en vez de 0 (ver migración 0038).
	const hours =
		r.minutes != null
			? r.minutes <= 1
				? 0
				: Math.round((r.minutes / 60) * 100) / 100
			: r.minutes_as_hours
				? parseFloat(r.minutes_as_hours)
				: null;
	const participated = (r.minutes ?? 0) > 0 || (r.studies ?? 0) > 0;
	let status = "submitted";
	if (r.submitted_month) {
		const [sy, sm] = r.submitted_month.split("-").map(Number);
		if (sy !== r.year || sm !== r.month) status = "late";
	}
	out.push(
		`INSERT INTO service_reports (id, user_id, entered_by_user_id, period_year, period_month, participated_in_ministry, is_auxiliary_pioneer_this_month, hours, bible_studies_count, credit_hours_note, comments, submitted_at, status) VALUES (` +
			`${sqlStr(crypto.randomUUID())}, ${sqlStr(userId)}, ${sqlStr(enteredBy)}, ${sqlNum(r.year)}, ${sqlNum(r.month)}, ${sqlBool(participated)}, ${sqlBool(r.pioneer === "Auxiliary")}, ` +
			`${sqlNum(hours)}, ${sqlNum(r.studies ?? 0)}, ${r.credithours != null ? sqlStr(`Crédito: ${r.credithours}`) : "NULL"}, ${sqlStr(r.remarks)}, ${sqlNum(unixEpoch(r.reported_at))}, ${sqlStr(status)});`,
	);
}
out.push("");

fs.writeFileSync(outputPath, out.join("\n") + "\n");
console.log(`Listo: ${outputPath}`);
console.log(`  usuarios: ${data.publishers.length + data.notPublishers.length}`);
console.log(`  grupos: ${data.fsGroups.length}`);
console.log(`  informes: ${data.reports.length}`);
console.log(`  privilegios otorgados: ${grants.size}`);
