export { APPOINTMENT_TYPES } from "@/db/schema";
export { SYSTEM_ROLES } from "@/db/schema";

// Coincide con el catálogo semilla de la migración 0005_privileges_rbac.sql.
export const PRIVILEGE_CODES = {
	MIDWEEK_CHAIRMAN: "midweek_chairman",
	TREASURES_TALK: "treasures_talk",
	SPIRITUAL_GEMS: "spiritual_gems",
	BIBLE_READING: "bible_reading",
	STUDENT_ASSIGNMENT: "student_assignment",
	CHRISTIAN_LIVING: "christian_living",
	CONGREGATION_NEEDS: "congregation_needs",
	CBS_CONDUCTOR: "cbs_conductor",
	CBS_READER: "cbs_reader",
	WEEKEND_CHAIRMAN: "weekend_chairman",
	PUBLIC_TALK_SPEAKER: "public_talk_speaker",
	WATCHTOWER_CONDUCTOR: "watchtower_conductor",
	WATCHTOWER_READER: "watchtower_reader",
	FIELD_SERVICE_REPORTS: "field_service_reports",
	MEETING_ATTENDANCE_RECORDER: "meeting_attendance_recorder",
	CO_VISIT_ACCESS: "co_visit_access",
	PASTORAL_CARE_ACCESS: "pastoral_care_access",
	HOUSEHOLDS_GROUP: "households_group",
	HOUSEHOLDS_ALL: "households_all",
	REPORTS_GROUP: "reports_group",
	REPORTS_ALL: "reports_all",
	PUBLISHERS_GROUP: "publishers_group",
	PUBLISHERS_ALL: "publishers_all",
	SERVICE_GROUPS_ACCESS: "service_groups_access",
	MIDWEEK_ACCESS: "midweek_access",
	WEEKEND_ACCESS: "weekend_access",
	OPERATIONAL_ACCESS: "operational_access",
	CONGREGATION_ACCESS: "congregation_access",
	DISASTER_ACCESS: "disaster_access",
	CO_VISIT_SCHEDULE_ACCESS: "co_visit_schedule_access",
	NOTIFY_PUBLISHERS: "notify_publishers",
	NOTIFY_GROUP: "notify_group",
	NOTIFY_CONGREGATION: "notify_congregation",
	ACCOUNTS_ADMIN: "accounts_admin",
	CLEANING_ADMIN: "cleaning_admin",
	TERRITORY_MANAGEMENT: "territory_management",
	PREACHING_ADMIN: "preaching_admin",
	TERRITORY_ASSIGNABLE: "territory_assignable",
	PUBLIC_PREACHING_ASSIGNABLE: "public_preaching_assignable",
} as const;

export const FIELD_SERVICE_GROUP_APPOINTMENTS = [
	"field_service_group_overseer",
	"field_service_group_assistant",
] as const;

// Comité de servicio (sfg 1:10) — quienes pueden ver las notas confidenciales
// de cualquier visita de pastoreo y prender/apagar su visibilidad general.
export const SERVICE_COMMITTEE_APPOINTMENTS = ["cobe", "secretary", "service_overseer"] as const;

// IDs literales sembrados en migrations/0005_privileges_rbac.sql — se
// referencian directamente (sin query extra) tanto desde el servidor (para
// sembrar las filas fijas de una reunión) como desde componentes cliente
// (para pedir la lista de elegibles de un privilegio puntual, p. ej. el
// presidente). Son solo strings, seguros de importar en el bundle cliente.
export const PRIVILEGE_IDS = {
	MIDWEEK_CHAIRMAN: "priv_midweek_chairman",
	TREASURES_TALK: "priv_treasures_talk",
	SPIRITUAL_GEMS: "priv_spiritual_gems",
	BIBLE_READING: "priv_bible_reading",
	STUDENT_ASSIGNMENT: "priv_student_assignment",
	CHRISTIAN_LIVING: "priv_christian_living",
	CONGREGATION_NEEDS: "priv_congregation_needs",
	CBS_CONDUCTOR: "priv_cbs_conductor",
	CBS_READER: "priv_cbs_reader",
	WEEKEND_CHAIRMAN: "priv_weekend_chairman",
	PUBLIC_TALK_SPEAKER: "priv_public_talk_speaker",
	WATCHTOWER_CONDUCTOR: "priv_watchtower_conductor",
	WATCHTOWER_READER: "priv_watchtower_reader",
	CONGREGATION_PRAYER: "priv_congregation_prayer",
	FIELD_SERVICE_REPORTS: "priv_field_service_reports",
	MEETING_ATTENDANCE_RECORDER: "priv_meeting_attendance",
	CO_VISIT_ACCESS: "priv_co_visit_access",
	PASTORAL_CARE_ACCESS: "priv_pastoral_care",
	HOUSEHOLDS_GROUP: "priv_households_group",
	HOUSEHOLDS_ALL: "priv_households_all",
	REPORTS_GROUP: "priv_reports_group",
	REPORTS_ALL: "priv_reports_all",
	PUBLISHERS_GROUP: "priv_publishers_group",
	PUBLISHERS_ALL: "priv_publishers_all",
	SERVICE_GROUPS_ACCESS: "priv_service_groups_access",
	MIDWEEK_ACCESS: "priv_midweek_access",
	WEEKEND_ACCESS: "priv_weekend_access",
	OPERATIONAL_ACCESS: "priv_operational_access",
	AUDIO_CONSOLE: "priv_audio_console",
	VIDEO_ZOOM: "priv_video_zoom",
	CONGREGATION_ACCESS: "priv_congregation_access",
	DISASTER_ACCESS: "priv_disaster_access",
	CO_VISIT_SCHEDULE_ACCESS: "priv_co_visit_schedule",
	NOTIFY_PUBLISHERS: "priv_notify_publishers",
	NOTIFY_GROUP: "priv_notify_group",
	NOTIFY_CONGREGATION: "priv_notify_congregation",
	ACCOUNTS_ADMIN: "priv_accounts_admin",
	CLEANING_ADMIN: "priv_cleaning_admin",
	TERRITORY_MANAGEMENT: "priv_territory_management",
	TERRITORY_ASSIGNABLE: "priv_territory_assignable",
	PUBLIC_PREACHING_ASSIGNABLE: "priv_public_preaching_assignable",
	PREACHING_ADMIN: "priv_preaching_admin",
} as const;

/** Privilegios con category='operational' que NO son tareas de una reunión: el de acceso al módulo y los de predicación/territorios.
 * No se siembran en la matriz de tareas operativas, no se ofrecen al agregar un puesto ni los propone la asignación automática. */
export const NON_MEETING_OPERATIONAL_IDS: string[] = [
	PRIVILEGE_IDS.OPERATIONAL_ACCESS,
	PRIVILEGE_IDS.PREACHING_ADMIN,
	PRIVILEGE_IDS.TERRITORY_ASSIGNABLE,
	PRIVILEGE_IDS.PUBLIC_PREACHING_ASSIGNABLE,
];

// Filas de sección fijas (una vez por semana) que se siembran automáticamente
// al crear una reunión de entre semana. "student_assignment" NO se siembra
// aquí porque su cantidad varía semana a semana — se agrega a mano desde el
// constructor semanal.
export const MIDWEEK_FIXED_SECTIONS = [
	{ sectionType: "treasures_talk", privilegeId: PRIVILEGE_IDS.TREASURES_TALK, sequenceOrder: 1, sectionTitle: null },
	{ sectionType: "spiritual_gems", privilegeId: PRIVILEGE_IDS.SPIRITUAL_GEMS, sequenceOrder: 2, sectionTitle: null },
	{ sectionType: "bible_reading", privilegeId: PRIVILEGE_IDS.BIBLE_READING, sequenceOrder: 3, sectionTitle: null },
	{ sectionType: "christian_living", privilegeId: PRIVILEGE_IDS.CHRISTIAN_LIVING, sequenceOrder: 5, sectionTitle: null },
	{ sectionType: "congregation_needs", privilegeId: PRIVILEGE_IDS.CONGREGATION_NEEDS, sequenceOrder: 6, sectionTitle: null },
	{ sectionType: "cbs", privilegeId: PRIVILEGE_IDS.CBS_CONDUCTOR, sequenceOrder: 7, sectionTitle: "Conductor" },
	{ sectionType: "cbs", privilegeId: PRIVILEGE_IDS.CBS_READER, sequenceOrder: 8, sectionTitle: "Lector" },
	{ sectionType: "prayer", privilegeId: PRIVILEGE_IDS.CONGREGATION_PRAYER, sequenceOrder: 9, sectionTitle: null },
] as const;

export const SECTION_LABELS: Record<string, string> = {
	treasures_talk: "Tesoros de la Biblia",
	spiritual_gems: "Busquemos perlas escondidas",
	bible_reading: "Lectura de la Biblia",
	student_assignment: "Seamos mejores maestros",
	christian_living: "Nuestra vida cristiana",
	congregation_needs: "Necesidades de la congregación",
	cbs: "Estudio bíblico de la congregación",
	prayer: "Oración",
};

// Agrupación de sectionType en los 3 bloques a colores de la Guía de
// actividades (mwb) — usado solo para el diseño visual del constructor
// semanal, no tiene relación con RBAC.
export const SECTION_GROUP_BY_TYPE: Record<string, "treasures" | "ministry" | "living"> = {
	treasures_talk: "treasures",
	spiritual_gems: "treasures",
	bible_reading: "treasures",
	student_assignment: "ministry",
	christian_living: "living",
	congregation_needs: "living",
	cbs: "living",
	living_custom: "living",
};

export const SECTION_GROUP_LABELS: Record<"treasures" | "ministry" | "living", string> = {
	treasures: "Tesoros de la Biblia",
	ministry: "Seamos mejores maestros",
	living: "Nuestra vida cristiana",
};
