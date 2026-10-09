#!/usr/bin/env node
// Llena un sitio de Mi Congre con la congregación ficticia "Demo" (nombres inventados, sin datos reales), usando la API
// pública con un administrador ya existente. Lo usan `npm run demo:deploy` (cada vez que se actualiza el sitio de
// demostración para Google Play) y se puede correr a mano:
//   node scripts/seed-demo.mjs https://demo.micongre.app <usuario-admin> <contraseña>
// Las fechas son relativas a hoy (reuniones de las próximas semanas, informes de los últimos 3 meses), así que conviene
// volver a correrlo de vez en cuando. Parte de una base vacía (tras scripts/wipe-all-data.sql).
const [base, adminUser, adminPass] = process.argv.slice(2);
if (!base || !adminUser || !adminPass) {
	console.error("Uso: node scripts/seed-demo.mjs <https://sitio> <usuario-admin> <contraseña>");
	process.exit(1);
}

const PRIV = {
	MIDWEEK_CHAIRMAN: "priv_midweek_chairman",
	STUDENT_ASSIGNMENT: "priv_student_assignment",
	WEEKEND_CHAIRMAN: "priv_weekend_chairman",
	WATCHTOWER_CONDUCTOR: "priv_watchtower_conductor",
	WATCHTOWER_READER: "priv_watchtower_reader",
	CONGREGATION_PRAYER: "priv_congregation_prayer",
	TERRITORY_ASSIGNABLE: "priv_territory_assignable",
};
// Sin regla por nombramiento: se otorgan a mano a cada publicador (como lo haría el cuerpo de ancianos).
const GRANTED = { BIBLE_READING: "priv_bible_reading", CBS_READER: "priv_cbs_reader", STUDENT: "priv_student_assignment" };

let token = "";
async function call(method, path, body) {
	// Recién desplegado, el Worker a veces responde 404/5xx de Cloudflare unos segundos: se reintenta (los POST solo si
	// la respuesta es la página de error de Cloudflare, que no llegó a la app).
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(new URL(path, base), {
			method,
			headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await response.text();
		let data = null;
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			data = text;
		}
		if (response.ok) return data;
		const notFromApp = typeof data === "string" && data.startsWith("<");
		const transient = notFromApp && (response.status === 404 || (response.status >= 500 && method !== "POST"));
		if (transient && attempt < 6) {
			await new Promise((r) => setTimeout(r, 2500 * attempt));
			continue;
		}
		throw new Error(`${method} ${path} → ${response.status} ${typeof data === "string" ? data.slice(0, 120) : JSON.stringify(data)}`);
	}
}
// Un paso que falla se avisa pero no detiene el resto: la demostración sigue siendo útil.
async function step(label, fn) {
	try {
		return await fn();
	} catch (error) {
		console.warn(`  ! ${label}: ${error.message}`);
		return null;
	}
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
function nextWeekday(from, weekday) {
	// weekday: 0 domingo … 6 sábado; devuelve el primero >= from
	const d = new Date(from);
	d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
	return d;
}

const login = await call("POST", "/api/auth/login", { username: adminUser, password: adminPass, clientType: "mobile" });
token = login.accessToken;
const adminId = login.user.id;
console.log(`Sesión iniciada como ${login.user.fullName}.`);

console.log("Congregación…");
await step("congregación", () =>
	call("PATCH", "/api/congregation", {
		name: "Demo",
		language: "es",
		kingdomHallAddress: "Calle Ficticia 123, Ciudad Demo",
		meetingSchedules: { midweek: { day: "Miércoles", time: "19:00" }, weekend: { day: "Domingo", time: "10:00" } },
		preachingTime: "09:00",
		skipOpeningPrayer: false,
	}),
);

console.log("Grupos de servicio…");
const groups = [];
for (const [name, color] of [["Grupo 1", "#3d6b4f"], ["Grupo 2", "#06a5cc"]]) {
	const g = await step(name, () => call("POST", "/api/field-service-groups", { name, color, regularMeetingPlace: "Salón del Reino" }));
	groups.push(g?.id ?? null);
}

// [nombre, género, estado teocrático, nacimiento, bautismo, grupo (0|1), nombramientos]
const PEOPLE = [
	["Carlos Mendoza Rivas", "male", "baptized_publisher", "1978-03-14", "1996-07-20", 0, ["elder", "field_service_group_overseer", "lm_meeting_overseer"]],
	["Luis Herrera Soto", "male", "baptized_publisher", "1972-11-02", "1990-04-08", 1, ["elder", "service_overseer", "field_service_group_overseer"]],
	["Jorge Salazar Vega", "male", "baptized_publisher", "1965-06-25", "1984-09-15", 0, ["elder", "watchtower_conductor", "secretary"]],
	["Andrés Paredes León", "male", "baptized_publisher", "1990-01-30", "2008-05-18", 0, ["ministerial_servant", "field_service_group_assistant"]],
	["Diego Navarro Cruz", "male", "baptized_publisher", "1985-09-09", "2003-10-11", 1, ["ministerial_servant", "field_service_group_assistant"]],
	["Miguel Ortega Ruiz", "male", "baptized_publisher", "1993-12-21", "2012-06-30", 1, ["ministerial_servant", "av_coordinator"]],
	["Rafael Campos Díaz", "male", "baptized_publisher", "1999-04-04", "2016-08-13", 0, []],
	["Esteban Molina Ríos", "male", "baptized_publisher", "2001-08-17", "2018-03-24", 1, []],
	["Daniel Fuentes Mora", "male", "unbaptized_publisher", "2008-02-11", null, 0, []],
	["María Torres Gil", "female", "baptized_publisher", "1980-05-19", "1999-11-06", 0, ["regular_pioneer"]],
	["Lucía Ramos Peña", "female", "baptized_publisher", "1976-10-28", "1994-02-12", 1, ["regular_pioneer"]],
	["Elena Vargas Cano", "female", "baptized_publisher", "1988-07-07", "2006-09-02", 0, ["auxiliary_pioneer"]],
	["Sofía Delgado Luna", "female", "baptized_publisher", "1995-03-23", "2013-12-07", 1, []],
	["Carmen Aguilar Soto", "female", "baptized_publisher", "1958-12-12", "1980-05-25", 0, []],
	["Patricia Ibarra Ney", "female", "baptized_publisher", "1983-02-02", "2001-07-14", 1, []],
	["Valeria Cruz Rey", "female", "unbaptized_publisher", "2010-06-06", null, 1, []],
];

console.log("Publicadores…");
const people = [];
for (const [fullName, gender, theocraticStatus, birthDate, baptismDate, g, appointments] of PEOPLE) {
	const created = await step(fullName, () =>
		call("POST", "/api/publishers", {
			fullName,
			gender,
			theocraticStatus,
			birthDate,
			baptismDate,
			fieldServiceGroupId: groups[g],
			isMinor: new Date(birthDate) > addDays(new Date(), -365 * 18),
		}),
	);
	if (!created) continue;
	if (appointments.length) await step(`nombramientos de ${fullName}`, () => call("PUT", `/api/publishers/${created.id}/appointments`, { appointmentTypes: appointments }));
	people.push({ id: created.id, fullName, gender, appointments });
}
// El revisor (administrador) también es anciano para que se le puedan asignar partes y se vea su Mi Panel completo.
await step("nombramientos del revisor", () => call("PUT", `/api/publishers/${adminId}/appointments`, { appointmentTypes: ["elder"] }));
await step("privilegios del revisor", () => call("PUT", `/api/publishers/${adminId}/privileges`, { privilegeIds: [PRIV.TERRITORY_ASSIGNABLE] }));

// Privilegios otorgados a mano: lectura, lector, oración y asignaciones de estudiantes.
const unbaptized = (name) => PEOPLE.find((p) => p[0] === name)?.[2] === "unbaptized_publisher";
for (const p of people) {
	const ids = [GRANTED.STUDENT];
	if (p.gender === "male" && !unbaptized(p.fullName)) ids.push(GRANTED.BIBLE_READING, GRANTED.CBS_READER, PRIV.WATCHTOWER_READER, PRIV.CONGREGATION_PRAYER);
	await step(`privilegios de ${p.fullName}`, () => call("PUT", `/api/publishers/${p.id}/privileges`, { privilegeIds: ids }));
}

const byName = (name) => people.find((p) => p.fullName === name)?.id ?? null;
await step("supervisores de grupo", async () => {
	if (groups[0]) await call("PATCH", `/api/field-service-groups/${groups[0]}`, { overseerUserId: byName("Carlos Mendoza Rivas"), assistantUserId: byName("Andrés Paredes León") });
	if (groups[1]) await call("PATCH", `/api/field-service-groups/${groups[1]}`, { overseerUserId: byName("Luis Herrera Soto"), assistantUserId: byName("Diego Navarro Cruz") });
});

console.log("Candidatos elegibles…");
const eligible = await call("GET", `/api/privileges/eligible?privilegeIds=${Object.values(PRIV).join(",")}`);
const pick = (privilegeId, index, filter = () => true) => {
	const list = (eligible[privilegeId] ?? []).filter(filter);
	return list.length ? list[index % list.length] : null;
};

const today = new Date();
const midweekDates = Array.from({ length: 4 }, (_, i) => iso(addDays(nextWeekday(addDays(today, -2), 3), i * 7)));
const weekendDates = Array.from({ length: 4 }, (_, i) => iso(addDays(nextWeekday(addDays(today, -2), 0), i * 7)));
// El revisor tiene partes en las primeras semanas (se ven en Mi Panel).
const adminFirst = (list, index) => (index < 2 && list.some((u) => u.id === adminId) ? list.find((u) => u.id === adminId) : null);

console.log("Reuniones entre semana…");
for (const [i, meetingDate] of midweekDates.entries()) {
	const created = await step(`entre semana ${meetingDate}`, () => call("POST", "/api/midweek", { meetingDate, weekLabel: `Semana ${i + 1} · programa de ejemplo`, openingSongNumber: 20 + i, hasAuxRoom: false }));
	if (!created) continue;
	const chairman = adminFirst(eligible[PRIV.MIDWEEK_CHAIRMAN] ?? [], i) ?? pick(PRIV.MIDWEEK_CHAIRMAN, i);
	const prayer = pick(PRIV.CONGREGATION_PRAYER, i + 1);
	await step("presidente", () => call("PATCH", `/api/midweek/${created.id}`, { chairmanUserId: chairman?.id ?? null, openingPrayerUserId: prayer?.id ?? null, closingSongNumber: 40 + i, middleSongNumber: 30 + i }));

	// Dos asignaciones de estudiantes (Seamos mejores maestros), con ayudante del mismo sexo.
	for (const [n, title] of ["Empiece conversaciones", "Haga revisitas"].entries()) {
		const main = pick(PRIV.STUDENT_ASSIGNMENT, i * 3 + n, (u) => u.gender === "female");
		const helper = main ? pick(PRIV.STUDENT_ASSIGNMENT, i * 3 + n + 1, (u) => u.gender === "female" && u.id !== main.id) : null;
		const row = await step(`parte ${title}`, () => call("POST", `/api/midweek/${created.id}/assignments`, { sectionType: "student_assignment", sectionTitle: title, description: "Demostración · 3 min" }));
		if (row?.id && main) await step(`asignar ${title}`, () => call("PATCH", `/api/midweek/${created.id}/assignments/${row.id}`, { mainAssigneeId: main.id, assistantAssigneeId: helper?.id ?? null, durationMinutes: 3 }));
	}

	// Partes fijas (Tesoros, Perlas, Lectura, Vida cristiana…): se rotan entre los elegibles de cada una.
	const detail = await step("detalle", () => call("GET", `/api/midweek/${created.id}`));
	const assignments = detail?.assignments ?? [];
	const privIds = [...new Set(assignments.map((a) => a.privilegeId).filter(Boolean))];
	const eligibleFor = privIds.length ? await step("elegibles", () => call("GET", `/api/privileges/eligible?privilegeIds=${privIds.join(",")}`)) : {};
	for (const [n, a] of assignments.entries()) {
		if (!a.privilegeId || a.mainAssigneeId) continue;
		const list = eligibleFor?.[a.privilegeId] ?? [];
		if (!list.length) continue;
		const mine = i < 2 && n === 0 ? list.find((u) => u.id === adminId) : null;
		const person = mine ?? list[(i + n) % list.length];
		await step(`asignar ${a.sectionType}`, () => call("PATCH", `/api/midweek/${created.id}/assignments/${a.id}`, { mainAssigneeId: person.id }));
	}
}

console.log("Reuniones de fin de semana…");
for (const [i, meetingDate] of weekendDates.entries()) {
	const created = await step(`fin de semana ${meetingDate}`, () => call("POST", "/api/weekend", { meetingDate }));
	if (!created) continue;
	const w = (privilegeId, shift) => (i === 0 && shift === 0 && (eligible[privilegeId] ?? []).some((u) => u.id === adminId) ? { id: adminId } : pick(privilegeId, i + shift));
	await step("roles", () =>
		call("PATCH", `/api/weekend/${created.id}`, {
			chairmanUserId: w(PRIV.WEEKEND_CHAIRMAN, 0)?.id ?? null,
			watchtowerConductorId: pick(PRIV.WATCHTOWER_CONDUCTOR, i)?.id ?? null,
			watchtowerReaderId: pick(PRIV.WATCHTOWER_READER, i + 2)?.id ?? null,
			prayerUserId: pick(PRIV.CONGREGATION_PRAYER, i + 3)?.id ?? null,
		}),
	);
}

console.log("Informes de servicio…");
const months = [1, 2, 3].map((back) => {
	const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
	return { periodYear: d.getUTCFullYear(), periodMonth: d.getUTCMonth() + 1 };
});
for (const [n, person] of people.entries()) {
	for (const [m, period] of months.entries()) {
		const pioneer = person.appointments.includes("regular_pioneer");
		const aux = person.appointments.includes("auxiliary_pioneer") && m === 0;
		const hours = pioneer ? 55 + ((n + m) % 4) * 5 : aux ? 30 : 6 + ((n * 3 + m) % 9);
		await step(`informe ${person.fullName}`, () =>
			call("POST", "/api/reports/s4", { userId: person.id, ...period, participatedInMinistry: true, isAuxiliaryPioneerThisMonth: aux, hours, bibleStudiesCount: (n + m) % 3, comments: null }),
		);
	}
}

console.log("Territorios…");
const square = (lng, lat, size = 0.004) => [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]];
const territories = [
	["1", "Centro Demo", -99.1332, 19.4326],
	["2", "Colonia Jardines", -99.1232, 19.4326],
	["3", "Barrio Norte", -99.1332, 19.4426],
];
let firstTerritory = null;
for (const [number, name, lng, lat] of territories) {
	const t = await step(`territorio ${number}`, () => call("POST", "/api/territories", { number, kind: "general", name }));
	if (!t?.id) continue;
	firstTerritory ??= t.id;
	await step(`mapa ${number}`, () =>
		call("PATCH", `/api/territories/${t.id}`, {
			mapData: {
				type: "FeatureCollection",
				features: [
					{ type: "Feature", geometry: { type: "Polygon", coordinates: square(lng, lat) }, properties: { fid: `poly-${number}` } },
					{ type: "Feature", geometry: { type: "Point", coordinates: [lng + 0.002, lat + 0.002] }, properties: { fid: `pt-${number}`, kind: "text", text: `Territorio ${number}` } },
				],
			},
		}),
	);
}
if (firstTerritory) await step("asignar territorio al revisor", () => call("POST", `/api/territories/${firstTerritory}/assign`, { assigneeUserId: adminId }));

console.log("Aviso de bienvenida…");
await step("aviso", () =>
	call("POST", "/api/notifications", {
		scope: "congregation",
		message: "Bienvenido a la congregación Demo. Estos datos son ficticios y sirven para probar la aplicación.",
		expiresAt: iso(addDays(today, 60)),
	}),
);

console.log(`\nListo: ${people.length} publicadores, ${midweekDates.length} reuniones entre semana y ${weekendDates.length} de fin de semana en ${base}`);
