// Migración desde NWScheduler (New World Scheduler) para el asistente de
// configuración inicial.
//
// NWScheduler no exporta un archivo único: cada opción de "Importar o
// Exportar" genera un CSV distinto. Este módulo reconoce cada archivo por su
// CONTENIDO (las columnas de la cabecera; el nombre del archivo no importa),
// los cruza entre sí (los informes y los contactos de emergencia refieren a
// las personas por nombre o por PersonID) y arma el SQL de inserción.
//
// Archivos que entiende:
//   persons   Personas               → users, hogares, grupos, nombramientos, privilegios
//   emergency Contactos de emergencia→ users.emergency_contact_*
//   reports   Informes del publicador→ service_reports
//   speakers  Discursantes           → speakers, speaker_congregations, speaker_outlines
//   program   Programa de discursos públicos → weekend_meetings
//
// Todo es puro (sin base de datos): el navegador lo usa para previsualizar
// qué se va a migrar (buildNwsImport → stats/warnings) y el servidor para
// ejecutarlo. Nada se guarda hasta que el servidor corre las sentencias.
//
// Qué NO se migra (sin destino en nuestro esquema): dirección/coordenadas de
// las personas, las "tareas" UseForDuty1-9 (sus nombres los define cada
// congregación en NWS y no viajan en el CSV), hospitalidad, predicación
// pública, limpieza/jardinería, mantenimiento, territorios, cánticos y
// asignaciones personalizadas.

import { dateOnly, insertMany, isMinor, sqlBool, sqlNum, sqlStr } from "./hourglass";

export type NwsKind = "persons" | "emergency" | "reports" | "speakers" | "program";
export type NwsRow = Record<string, string>;
export type NwsBundle = Partial<Record<NwsKind, NwsRow[]>>;

export const NWS_KINDS: { kind: NwsKind; label: string; hint: string; required: boolean }[] = [
	{ kind: "persons", label: "Personas", hint: "Publicadores, nombramientos, grupos y privilegios", required: true },
	{ kind: "emergency", label: "Contactos de emergencia", hint: "Contacto de emergencia de cada persona", required: false },
	{ kind: "reports", label: "Informes del publicador", hint: "Historial de informes de servicio", required: false },
	{ kind: "speakers", label: "Discursantes", hint: "Oradores locales y visitantes con sus bosquejos", required: false },
	{ kind: "program", label: "Programa de discursos públicos", hint: "Reuniones de fin de semana ya programadas", required: false },
];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** CSV con comillas ("" escapa una comilla, saltos de línea dentro de comillas)
 * y BOM opcional. Devuelve cabecera y filas como objetos. */
export function parseCsv(text: string): { headers: string[]; rows: NwsRow[] } {
	const src = text.replace(/^﻿/, "");
	const table: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quoted) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(cell);
			cell = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && src[i + 1] === "\n") i++;
			row.push(cell);
			table.push(row);
			row = [];
			cell = "";
		} else cell += c;
	}
	if (cell !== "" || row.length) {
		row.push(cell);
		table.push(row);
	}
	const nonEmpty = table.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
	const headers = (nonEmpty[0] ?? []).map((h) => h.trim());
	const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
	return { headers, rows };
}

/** Qué archivo de NWScheduler es, según sus columnas. */
export function detectNwsKind(headers: string[]): NwsKind | null {
	const h = new Set(headers);
	const has = (...cols: string[]) => cols.every((c) => h.has(c));
	if (has("PersonID", "FirstName", "LastName", "Privilege")) return "persons";
	if (has("PublisherID", "Relationship")) return "emergency";
	if (has("SharedInMinistry", "BibleStudies", "FirstName", "LastName")) return "reports";
	if (has("PublicTalksCanGive", "FirstName", "LastName", "Congregation") && !h.has("PersonID")) return "speakers";
	if (has("OutlineNumber", "PublicSpeaker", "Date")) return "program";
	return null;
}

/** Lee un CSV y dice qué archivo de NWScheduler es (null si no se reconoce). */
export function classifyNwsFile(text: string): { kind: NwsKind; rows: NwsRow[] } | null {
	const { headers, rows } = parseCsv(text);
	const kind = detectNwsKind(headers);
	return kind ? { kind, rows } : null;
}

/** Varios CSV a la vez, en cualquier orden: cada uno se ubica por su contenido. */
export function parseNwsFiles(texts: string[]): { bundle: NwsBundle; unrecognized: number } {
	const bundle: NwsBundle = {};
	let unrecognized = 0;
	for (const text of texts) {
		const file = classifyNwsFile(text);
		if (file) bundle[file.kind] = file.rows;
		else unrecognized++;
	}
	return { bundle, unrecognized };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const isTrue = (v: string | undefined) => (v ?? "").toLowerCase() === "true";

function norm(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

/** Nombre sin orden ni acentos: "Pérez, Ana" y "Ana Pérez" dan la misma clave. */
function nameKey(...parts: (string | undefined)[]): string {
	return norm(parts.filter(Boolean).join(" "))
		.split(/[^a-z0-9ñ]+/)
		.filter(Boolean)
		.sort()
		.join(" ");
}

function ymd(value: string | undefined): string | null {
	if (!value) return null;
	const m = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
	if (!m) return null;
	return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseHours(value: string | undefined): number | null {
	if (!value) return null;
	const hm = value.match(/^(\d+):(\d{1,2})$/);
	if (hm) return Math.round((Number(hm[1]) + Number(hm[2]) / 60) * 100) / 100;
	const n = Number(value.replace(",", "."));
	return Number.isFinite(n) ? n : null;
}

function outlineNumbers(value: string | undefined): number[] {
	return [...new Set((value ?? "").split(/[^0-9]+/).filter(Boolean).map(Number))].filter((n) => n > 0);
}

const RELATION_ES: Record<string, string> = {
	spouse: "Cónyuge",
	friend: "Amigo(a)",
	parent: "Padre/madre",
	child: "Hijo(a)",
	sibling: "Hermano(a)",
	relative: "Familiar",
	other: "Otro",
};

// Banderas "UseFor…" de NWScheduler → privilegios de nuestro catálogo
// (migrations/0005). Las demás (tareas numeradas, hospitalidad, predicación
// pública, oraciones, limpieza…) no tienen equivalente claro.
const PRIVILEGE_MAP: Array<[string[], string]> = [
	[["UseForChairman"], "priv_midweek_chairman"],
	[["UseForTreasuresTalk"], "priv_treasures_talk"],
	[["UseForTreasuresGems"], "priv_spiritual_gems"],
	[["UseForTreasuresBR"], "priv_bible_reading"],
	[["UseForApplyIC", "UseForApplyRV", "UseForApplyBS", "UseForApplyExplaining", "UseForApplyStudentTalk"], "priv_student_assignment"],
	[["UseForLivingParts"], "priv_christian_living"],
	[["UseForCBS"], "priv_cbs_conductor"],
	[["UseForCBSReader"], "priv_cbs_reader"],
	[["UseForPublicTalksLocal", "UseForPublicTalksAway"], "priv_public_talk_speaker"],
	[["UseForWeekendChairman"], "priv_weekend_chairman"],
	[["UseForWatchtowerReader"], "priv_watchtower_reader"],
];

const PIONEER_APPOINTMENTS: Record<string, string> = {
	regularpioneer: "regular_pioneer",
	specialpioneer: "special_pioneer",
	missionary: "missionary",
	auxiliarypioneer: "auxiliary_pioneer",
	continuousauxiliarypioneer: "auxiliary_pioneer",
	auxiliarycontinuous: "auxiliary_pioneer",
};

// ---------------------------------------------------------------------------
// Armado de la migración
// ---------------------------------------------------------------------------

export interface NwsStats {
	people: number;
	inactive: number;
	households: number;
	groups: number;
	appointments: number;
	privileges: number;
	emergencyContacts: number;
	reports: number;
	speakers: number;
	visitingCongregations: number;
	meetings: number;
}

export interface NwsImport {
	statements: string[];
	stats: NwsStats;
	warnings: string[];
	/** Nombre de la congregación propia, si se pudo deducir (ver ownCongregation). */
	congregationName: string | null;
}

export class NwsError extends Error {}

const cap = (list: string[], n = 4) => list.slice(0, n).join(", ") + (list.length > n ? `… (+${list.length - n})` : "");

export function buildNwsImport(bundle: NwsBundle, now: Date = new Date()): NwsImport {
	const persons = bundle.persons ?? [];
	if (persons.length === 0) throw new NwsError("Falta el archivo de Personas (o está vacío).");

	const warnings: string[] = [];
	const importDate = dateOnly(now.toISOString())!;
	const importNote = `Importado de NWScheduler el ${importDate}; fecha de inicio real desconocida.`;
	const currentPeriod = now.getFullYear() * 12 + now.getMonth() + 1;

	// --- 1. Personas -------------------------------------------------------
	interface Person {
		id: string;
		row: NwsRow;
		fullName: string;
		phone: string | null;
		householdId: string | null;
	}
	const people: Person[] = persons.map((row) => ({
		id: crypto.randomUUID(),
		row,
		fullName: [row.FirstName, row.MiddleName, row.LastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "Sin nombre",
		phone: row.PhoneMobile || row.PhoneHome || row.PhoneWork || null,
		householdId: null,
	}));
	const byNwsId = new Map(people.map((p) => [p.row.PersonID, p]));

	// Índice por nombre (con y sin segundo nombre, y DisplayName) para cruzar
	// informes, discursantes y programa. Un nombre repetido es ambiguo.
	const nameIndex = new Map<string, Person[]>();
	for (const p of people) {
		const keys = new Set([
			nameKey(p.row.FirstName, p.row.LastName),
			nameKey(p.row.FirstName, p.row.MiddleName, p.row.LastName),
			nameKey(p.row.DisplayName),
		]);
		for (const k of keys) {
			if (!k) continue;
			const list = nameIndex.get(k) ?? [];
			if (!list.includes(p)) list.push(p);
			nameIndex.set(k, list);
		}
	}
	const findPerson = (key: string): Person | null => {
		const list = nameIndex.get(key);
		return list && list.length === 1 ? list[0] : null;
	};
	const ambiguous = [...nameIndex.values()].filter((l) => l.length > 1).length;
	if (ambiguous > 0) warnings.push(`${ambiguous} nombre(s) repetido(s) entre las personas: sus informes y asignaciones no se pueden enlazar con seguridad y se omiten.`);

	// Hogares: personas con el mismo FamilyID (solo familias de 2 o más).
	const families = new Map<string, Person[]>();
	for (const p of people) {
		const fid = p.row.FamilyID;
		if (!fid || fid === "0") continue;
		families.set(fid, [...(families.get(fid) ?? []), p]);
	}
	const householdRows: string[][] = [];
	for (const members of families.values()) {
		if (members.length < 2) continue;
		const head = members.find((m) => isTrue(m.row.FamilyHead)) ?? members[0];
		const id = crypto.randomUUID();
		householdRows.push([sqlStr(id), sqlStr(`Familia ${head.row.LastName || head.fullName}`)]);
		for (const m of members) m.householdId = id;
	}

	// Contactos de emergencia: por persona, el primero que tenga teléfono (el
	// teléfono del cónyuge se toma de su propia ficha si el contacto es una
	// persona de la congregación).
	const emergencyByPerson = new Map<string, { name: string; phone: string | null; relation: string | null }>();
	if (bundle.emergency) {
		const grouped = new Map<string, NwsRow[]>();
		let orphan = 0;
		for (const e of bundle.emergency) {
			if (!byNwsId.has(e.PublisherID)) {
				orphan++;
				continue;
			}
			grouped.set(e.PublisherID, [...(grouped.get(e.PublisherID) ?? []), e]);
		}
		let extra = 0;
		for (const [pid, list] of grouped) {
			list.sort((a, b) => Number(a.Order) - Number(b.Order));
			const resolved = list.map((e) => ({
				name: e.Name,
				phone: e.Mobile || e.Phone || (e.CongregationPersonID && e.CongregationPersonID !== "0" ? (byNwsId.get(e.CongregationPersonID)?.phone ?? null) : null),
				relation: e.Relationship ? (RELATION_ES[e.Relationship.toLowerCase()] ?? e.Relationship) : null,
			}));
			const chosen = resolved.find((c) => c.phone) ?? resolved[0];
			emergencyByPerson.set(pid, chosen);
			extra += resolved.length - 1;
		}
		if (extra > 0) warnings.push(`${extra} contacto(s) de emergencia adicionales no se migraron (cada persona guarda uno).`);
		if (orphan > 0) warnings.push(`${orphan} contacto(s) de emergencia son de personas que no están en el archivo de Personas.`);
	}

	// Grupos de servicio: FieldServiceGroupID distinto de 0.
	const groupBuckets = new Map<string, { name: string; members: Person[] }>();
	let responsibilityWithoutGroup = 0;
	for (const p of people) {
		const gid = p.row.FieldServiceGroupID;
		const inGroup = gid && gid !== "0" && norm(p.row.GroupName ?? "") !== "no asignado";
		if (!inGroup) {
			if (["overseer", "assistant"].includes(norm(p.row.GroupResponsibility ?? ""))) responsibilityWithoutGroup++;
			continue;
		}
		const bucket = groupBuckets.get(gid) ?? { name: p.row.GroupName || `Grupo ${gid}`, members: [] };
		bucket.members.push(p);
		groupBuckets.set(gid, bucket);
	}
	if (responsibilityWithoutGroup > 0) {
		warnings.push(`${responsibilityWithoutGroup} persona(s) tienen responsabilidad de grupo (superintendente/auxiliar) pero no pertenecen a ningún grupo: no se creó ese nombramiento.`);
	}

	// Estado de cada persona
	const userRows: string[][] = [];
	let inactive = 0;
	const unknownPioneer = new Set<string>();
	for (const p of people) {
		const r = p.row;
		const priv = r.Privilege;
		const removed = isTrue(r.Removed) || isTrue(r.Moved);
		const theo = priv === "UBP" ? "unbaptized_publisher" : priv === "No" ? "student" : "baptized_publisher";
		let cong: string;
		if (removed || !isTrue(r.Active)) cong = "inactive";
		else cong = isTrue(r.Regular) ? "active" : "irregular";
		// Un estudiante de la escuela que no es publicador no está "inactivo".
		if (priv === "No" && isTrue(r.CLMStudent) && !removed) cong = "active";
		if (cong === "inactive") inactive++;

		const birth = ymd(r.DOB);
		const emergency = emergencyByPerson.get(r.PersonID);
		userRows.push([
			sqlStr(p.id),
			sqlStr(p.fullName),
			sqlStr(r.Email || r.Email2),
			sqlStr(p.phone),
			sqlStr(birth),
			sqlStr(ymd(r.DateOfBaptism)),
			sqlStr(r.Gender === "Female" ? "female" : "male"),
			sqlStr(cong),
			sqlStr(theo),
			sqlBool(isTrue(r.Child) || isMinor(birth, importDate)),
			sqlStr(p.householdId),
			sqlStr(emergency?.name),
			sqlStr(emergency?.phone),
			sqlStr(emergency?.relation),
			"'regular'",
			"'no_account'",
			"1",
		]);
		const ps = norm(r.PioneerStatus ?? "").replace(/[^a-z]/g, "");
		if (ps && ps !== "no" && ps !== "none" && !PIONEER_APPOINTMENTS[ps]) unknownPioneer.add(r.PioneerStatus);
	}
	if (unknownPioneer.size > 0) warnings.push(`Estado de precursorado desconocido (se ignoró): ${cap([...unknownPioneer])}.`);

	const statements: string[] = [];
	statements.push(...insertMany("households", ["id", "label"], householdRows));
	statements.push(
		...insertMany(
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
				"household_id",
				"emergency_contact_name",
				"emergency_contact_phone",
				"emergency_contact_relation",
				"system_role",
				"account_status",
				"active",
			],
			userRows,
		),
	);

	// --- 2. Grupos + nombramientos ----------------------------------------
	const appointmentRows: string[][] = [];
	const addAppointment = (userId: string, type: string, start: string, notes: string) =>
		appointmentRows.push([sqlStr(crypto.randomUUID()), sqlStr(userId), sqlStr(type), sqlStr(start), "NULL", sqlStr(notes)]);

	const groupRows: string[][] = [];
	const groupAssignments: string[] = [];
	for (const bucket of groupBuckets.values()) {
		const id = crypto.randomUUID();
		const overseer = bucket.members.find((m) => norm(m.row.GroupResponsibility ?? "") === "overseer");
		const assistant = bucket.members.find((m) => norm(m.row.GroupResponsibility ?? "") === "assistant");
		groupRows.push([sqlStr(id), sqlStr(bucket.name), sqlStr(overseer?.id), sqlStr(assistant?.id), "1"]);
		for (const m of bucket.members) groupAssignments.push(`UPDATE users SET field_service_group_id = ${sqlStr(id)} WHERE id = ${sqlStr(m.id)};`);
		if (overseer) addAppointment(overseer.id, "field_service_group_overseer", importDate, `Superintendente de ${bucket.name}. ${importNote}`);
		if (assistant) addAppointment(assistant.id, "field_service_group_assistant", importDate, `Auxiliar de ${bucket.name}. ${importNote}`);
	}
	statements.push(...insertMany("field_service_groups", ["id", "name", "overseer_user_id", "assistant_user_id", "active"], groupRows));
	statements.push(...groupAssignments);

	for (const p of people) {
		const r = p.row;
		const start = ymd(r.DateOfPrivilege) ?? importDate;
		const note = ymd(r.DateOfPrivilege) ? "Importado de NWScheduler." : importNote;
		if (r.Privilege === "E") addAppointment(p.id, "elder", start, note);
		if (r.Privilege === "MS") addAppointment(p.id, "ministerial_servant", start, note);
		const ps = norm(r.PioneerStatus ?? "").replace(/[^a-z]/g, "");
		if (PIONEER_APPOINTMENTS[ps]) addAppointment(p.id, PIONEER_APPOINTMENTS[ps], importDate, importNote);
	}
	statements.push(...insertMany("theocratic_appointments", ["id", "user_id", "appointment_type", "start_date", "end_date", "notes"], appointmentRows));

	// --- 3. Privilegios ----------------------------------------------------
	const grantRows: string[][] = [];
	for (const p of people) {
		const granted = new Set<string>();
		for (const [flags, privilegeId] of PRIVILEGE_MAP) {
			if (flags.some((f) => isTrue(p.row[f])) && !granted.has(privilegeId)) {
				granted.add(privilegeId);
				grantRows.push([sqlStr(crypto.randomUUID()), sqlStr(p.id), sqlStr(privilegeId), sqlStr(importDate), "1"]);
			}
		}
	}
	statements.push(...insertMany("user_privileges", ["id", "user_id", "privilege_id", "approved_at", "active"], grantRows));

	// --- 4. Informes -------------------------------------------------------
	const reportRows: string[][] = [];
	let reportCount = 0;
	if (bundle.reports) {
		const seen = new Set<string>();
		const unknownNames = new Set<string>();
		let emptyMonths = 0;
		let futureMonths = 0;
		for (const r of bundle.reports) {
			const m = r.Date.match(/^(\d{4})-(\d{1,2})/);
			if (!m) continue;
			const year = Number(m[1]);
			const month = Number(m[2]);
			if (year * 12 + month > currentPeriod) {
				futureMonths++;
				continue;
			}
			const person = findPerson(nameKey(r.FirstName, r.LastName));
			if (!person) {
				unknownNames.add(`${r.FirstName} ${r.LastName}`.trim());
				continue;
			}
			const studies = Number(r.BibleStudies) || 0;
			const hours = parseHours(r.Hours);
			const credit = r.Credit ? `Crédito: ${r.Credit}` : null;
			const participated = isTrue(r.SharedInMinistry) || studies > 0 || (hours ?? 0) > 0;
			if (!participated && !credit && !r.Remarks) {
				emptyMonths++;
				continue;
			}
			const dedupe = `${person.id}|${year}|${month}`;
			if (seen.has(dedupe)) continue;
			seen.add(dedupe);
			reportRows.push([
				sqlStr(crypto.randomUUID()),
				sqlStr(person.id),
				sqlStr(person.id),
				sqlNum(year),
				sqlNum(month),
				sqlBool(participated),
				sqlBool(isTrue(r.AP)),
				sqlNum(hours),
				sqlNum(studies),
				sqlStr(credit),
				sqlStr(r.Remarks),
				"'submitted'",
			]);
		}
		reportCount = reportRows.length;
		if (unknownNames.size > 0) warnings.push(`Informes de personas que no están en el archivo de Personas (omitidos): ${cap([...unknownNames])}.`);
		if (emptyMonths > 0) {
			warnings.push(`${emptyMonths} mes(es) sin participación ni datos no se migraron como informe (NWScheduler no distingue "no informó" de "no participó").`);
		}
		void futureMonths;
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
				"status",
			],
			reportRows,
		),
	);

	// --- 5. Oradores -------------------------------------------------------
	interface Speaker {
		id: string;
		userId: string | null;
		fullName: string | null;
		phone: string | null;
		congregation: string | null;
		notes: string | null;
		outlines: Set<number>;
	}
	const speakers = new Map<string, Speaker>(); // clave: nameKey
	const ensureLocal = (p: Person): Speaker => {
		const key = nameKey(p.row.FirstName, p.row.LastName);
		let s = speakers.get(key);
		if (!s) {
			s = { id: crypto.randomUUID(), userId: p.id, fullName: null, phone: null, congregation: null, notes: null, outlines: new Set() };
			speakers.set(key, s);
		}
		return s;
	};
	const ensureVisiting = (fullName: string, phone: string | null, congregation: string | null, notes: string | null): Speaker => {
		const key = nameKey(fullName);
		let s = speakers.get(key);
		if (!s) {
			s = { id: crypto.randomUUID(), userId: null, fullName, phone, congregation, notes, outlines: new Set() };
			speakers.set(key, s);
		}
		return s;
	};

	// Locales: quienes dan discursos aquí o fuera, o tienen bosquejos registrados.
	for (const p of people) {
		const nums = outlineNumbers(p.row.PublicTalksCanGive);
		if (isTrue(p.row.UseForPublicTalksLocal) || isTrue(p.row.UseForPublicTalksAway) || nums.length > 0) {
			for (const n of nums) ensureLocal(p).outlines.add(n);
			ensureLocal(p);
		}
	}
	// Discursantes: si coinciden con una persona son locales; si no, visitantes.
	const ownVotes = new Map<string, number>();
	const visitingCongregations = new Set<string>();
	for (const d of bundle.speakers ?? []) {
		const person = findPerson(nameKey(d.FirstName, d.LastName));
		const nums = outlineNumbers(d.PublicTalksCanGive);
		if (person) {
			const s = ensureLocal(person);
			nums.forEach((n) => s.outlines.add(n));
			if (!s.notes && d.PublicNotes) s.notes = d.PublicNotes;
			if (d.Congregation) ownVotes.set(d.Congregation, (ownVotes.get(d.Congregation) ?? 0) + 1);
		} else {
			const s = ensureVisiting(`${d.FirstName} ${d.LastName}`.trim(), d.PhoneMobile || d.PhoneHome || null, d.Congregation || null, d.PublicNotes || null);
			nums.forEach((n) => s.outlines.add(n));
			if (d.Congregation) visitingCongregations.add(d.Congregation);
		}
	}
	const ownCongregation = [...ownVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

	// --- 6. Programa de discursos públicos --------------------------------
	interface Meeting {
		date: string;
		chairman: Person | null;
		reader: Person | null;
		speaker: Speaker | null;
		outline: number | null;
		cancelled: boolean;
		notes: string | null;
	}
	const meetings: Meeting[] = [];
	if (bundle.program) {
		const unmatched = new Set<string>();
		let blank = 0;
		for (const r of bundle.program) {
			const date = ymd(r.Date);
			if (!date) continue;
			const cancelled = isTrue(r.NoMeeting);
			const notes = [r.LocalNotes, r.PublicNotes].filter(Boolean).join(" · ") || null;
			const hasContent = r.PublicSpeaker || r.OutlineNumber || r.Chairman || r.WatchtowerReader || cancelled || notes;
			if (!hasContent) {
				blank++;
				continue;
			}
			const lookup = (name: string | undefined): Person | null => {
				if (!name) return null;
				const p = findPerson(nameKey(name));
				if (!p) unmatched.add(name);
				return p;
			};
			let speaker: Speaker | null = null;
			if (r.PublicSpeaker) {
				const person = findPerson(nameKey(r.PublicSpeaker));
				if (person) speaker = ensureLocal(person);
				else {
					speaker = ensureVisiting(r.PublicSpeaker, null, r.Congregation || null, null);
					if (r.Congregation && r.Congregation !== ownCongregation) visitingCongregations.add(r.Congregation);
				}
			}
			const outline = Number(r.OutlineNumber) > 0 ? Number(r.OutlineNumber) : null;
			if (speaker && outline) speaker.outlines.add(outline);
			meetings.push({ date, chairman: lookup(r.Chairman), reader: lookup(r.WatchtowerReader), speaker, outline, cancelled, notes });
		}
		if (unmatched.size > 0) warnings.push(`Nombres del programa que no coinciden con ninguna persona (quedaron sin asignar): ${cap([...unmatched])}.`);
		void blank;
	}

	// Congregaciones visitantes → speaker_congregations (nombre único).
	const congIds = new Map<string, string>();
	for (const s of speakers.values()) {
		if (s.userId || !s.congregation || congIds.has(s.congregation)) continue;
		congIds.set(s.congregation, crypto.randomUUID());
	}
	statements.push(
		...insertMany(
			"speaker_congregations",
			["id", "name"],
			[...congIds.entries()].map(([name, id]) => [sqlStr(id), sqlStr(name)]),
		),
	);
	statements.push(
		...insertMany(
			"speakers",
			["id", "kind", "user_id", "full_name", "phone", "congregation_id", "notes", "active"],
			[...speakers.values()].map((s) => [
				sqlStr(s.id),
				s.userId ? "'local'" : "'visiting'",
				sqlStr(s.userId),
				sqlStr(s.fullName),
				sqlStr(s.phone),
				sqlStr(s.congregation ? congIds.get(s.congregation) : null),
				sqlStr(s.notes),
				"1",
			]),
		),
	);
	// Bosquejos: los que se mencionan pero no están en el catálogo se crean con
	// título provisional (INSERT OR IGNORE: los que ya existen no se tocan) para
	// que los repertorios y el programa no pierdan el enlace; la importación del
	// EPUB oficial los completa luego por número.
	const referenced = new Map<number, string>();
	for (const sp of speakers.values()) for (const n of sp.outlines) referenced.set(n, referenced.get(n) ?? `Discurso ${n}`);
	for (const r of bundle.program ?? []) {
		const n = Number(r.OutlineNumber);
		if (n > 0) referenced.set(n, r.OutlineName || referenced.get(n) || `Discurso ${n}`);
	}
	if (referenced.size > 0) {
		for (const [n, title] of referenced) {
			statements.push(
				`INSERT OR IGNORE INTO public_talk_outlines (id, number, category, title) VALUES (${sqlStr(crypto.randomUUID())}, ${n}, 'Sin categoría', ${sqlStr(title)});`,
			);
		}
		warnings.push(
			`${referenced.size} bosquejo(s) de discursos se mencionan en el archivo; los que no estaban en el catálogo quedan con título provisional («Discurso N») — importa los bosquejos oficiales (EPUB) en Fin de semana para completarlos.`,
		);
	}
	for (const s of speakers.values()) {
		if (s.outlines.size === 0) continue;
		statements.push(
			`INSERT OR IGNORE INTO speaker_outlines (speaker_id, outline_id) SELECT ${sqlStr(s.id)}, id FROM public_talk_outlines WHERE number IN (${[...s.outlines].join(", ")});`,
		);
	}

	// Reuniones de fin de semana (fecha única; si se repite, gana la última).
	const meetingByDate = new Map(meetings.map((m) => [m.date, m]));
	for (const m of meetingByDate.values()) {
		statements.push(
			`INSERT INTO weekend_meetings (id, meeting_date, chairman_user_id, speaker_id, talk_outline_id, watchtower_reader_id, status, notes) VALUES (` +
				`${sqlStr(crypto.randomUUID())}, ${sqlStr(m.date)}, ${sqlStr(m.chairman?.id)}, ${sqlStr(m.speaker?.id)}, ` +
				`${m.outline ? `(SELECT id FROM public_talk_outlines WHERE number = ${m.outline})` : "NULL"}, ` +
				`${sqlStr(m.reader?.id)}, ${sqlStr(m.cancelled ? "cancelled" : "scheduled")}, ${sqlStr(m.notes)});`,
		);
	}

	return {
		statements,
		stats: {
			people: people.length,
			inactive,
			households: householdRows.length,
			groups: groupRows.length,
			appointments: appointmentRows.length,
			privileges: grantRows.length,
			emergencyContacts: emergencyByPerson.size,
			reports: reportCount,
			speakers: speakers.size,
			visitingCongregations: congIds.size,
			meetings: meetingByDate.size,
		},
		warnings,
		congregationName: ownCongregation,
	};
}
