CREATE TABLE privileges (
	id TEXT PRIMARY KEY,
	code TEXT NOT NULL,
	name TEXT NOT NULL,
	category TEXT NOT NULL CHECK (category IN ('meeting', 'operational', 'administrative')),
	requires_male INTEGER NOT NULL DEFAULT 0,
	requires_baptized INTEGER NOT NULL DEFAULT 0,
	requires_adult INTEGER NOT NULL DEFAULT 0,
	allows_minor_with_parental_consent INTEGER NOT NULL DEFAULT 0,
	is_system_defined INTEGER NOT NULL DEFAULT 0,
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX priv_code_idx ON privileges(code);

CREATE TABLE appointment_privilege_rules (
	id TEXT PRIMARY KEY,
	privilege_id TEXT NOT NULL REFERENCES privileges(id) ON DELETE CASCADE,
	appointment_type TEXT NOT NULL,
	requires_competency_flag INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX rule_priv_appt_idx ON appointment_privilege_rules(privilege_id, appointment_type);

CREATE TABLE user_privileges (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	privilege_id TEXT NOT NULL REFERENCES privileges(id) ON DELETE CASCADE,
	approved_at TEXT NOT NULL,
	approved_by_user_id TEXT REFERENCES users(id),
	parental_consent INTEGER NOT NULL DEFAULT 0,
	active INTEGER NOT NULL DEFAULT 1,
	revoked_at TEXT
);

CREATE UNIQUE INDEX user_priv_idx ON user_privileges(user_id, privilege_id);
CREATE INDEX user_priv_active_idx ON user_privileges(privilege_id, active);

-- Catálogo semilla: privilegios de reunión (S-38) ------------------------------
INSERT INTO privileges (id, code, name, category, requires_male, requires_baptized, is_system_defined) VALUES
	('priv_midweek_chairman', 'midweek_chairman', 'Presidencia Vida y Ministerio', 'meeting', 1, 1, 1),
	('priv_treasures_talk', 'treasures_talk', 'Tesoros de la Biblia: discurso', 'meeting', 1, 1, 1),
	('priv_spiritual_gems', 'spiritual_gems', 'Perlas escondidas', 'meeting', 1, 1, 1),
	('priv_bible_reading', 'bible_reading', 'Lectura de la Biblia', 'meeting', 1, 0, 1),
	('priv_student_assignment', 'student_assignment', 'Asignación de estudiante (Seamos mejores maestros)', 'meeting', 0, 0, 1),
	('priv_christian_living', 'christian_living', 'Nuestra vida cristiana', 'meeting', 1, 1, 1),
	('priv_congregation_needs', 'congregation_needs', 'Necesidades de la congregación', 'meeting', 1, 1, 1),
	('priv_cbs_conductor', 'cbs_conductor', 'Conductor del Estudio Bíblico de la Congregación', 'meeting', 1, 1, 1),
	('priv_cbs_reader', 'cbs_reader', 'Lector del Estudio Bíblico de la Congregación', 'meeting', 1, 1, 1),
	('priv_weekend_chairman', 'weekend_chairman', 'Presidente de fin de semana', 'meeting', 1, 1, 1),
	('priv_public_talk_speaker', 'public_talk_speaker', 'Orador de discurso público', 'meeting', 1, 1, 1),
	('priv_watchtower_conductor', 'watchtower_conductor', 'Conductor de La Atalaya', 'meeting', 1, 1, 1),
	('priv_watchtower_reader', 'watchtower_reader', 'Lector de La Atalaya', 'meeting', 1, 1, 1);

-- Catálogo semilla: tareas operativas (dinámicas, ajustables desde la UI) ------
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_mic_1', 'mic_1', 'Micrófono 1', 'operational', 0),
	('priv_mic_2', 'mic_2', 'Micrófono 2', 'operational', 0),
	('priv_audio_console', 'audio_console', 'Audio / consola', 'operational', 0),
	('priv_video_zoom', 'video_zoom', 'Video / Zoom', 'operational', 0),
	('priv_usher_entrance', 'usher_entrance', 'Acomodador de entrada', 'operational', 0),
	('priv_usher_auditorium', 'usher_auditorium', 'Acomodador de auditorio', 'operational', 0),
	('priv_usher_parking', 'usher_parking', 'Acomodador de estacionamiento', 'operational', 0),
	('priv_platform', 'platform', 'Plataforma', 'operational', 0);

-- Catálogo semilla: privilegios administrativos y de informes ------------------
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_field_service_reports', 'field_service_reports', 'Recolección de informes de servicio (S-4/S-21)', 'administrative', 1),
	('priv_territory_management', 'territory_management', 'Gestión de territorios (S-13)', 'administrative', 1),
	('priv_meeting_attendance', 'meeting_attendance_recorder', 'Registro de asistencia (S-88)', 'administrative', 1);

-- Reglas por nombramiento: qué appointment_type califica automáticamente para
-- cada privilegio de reunión. requires_competency_flag=1 marca los casos donde
-- S-38 exige que el siervo ministerial esté además marcado como "capacitado".
INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_chairman_elder', 'priv_midweek_chairman', 'elder', 0),
	('rule_chairman_ms', 'priv_midweek_chairman', 'ministerial_servant', 1),
	('rule_treasures_elder', 'priv_treasures_talk', 'elder', 0),
	('rule_treasures_ms', 'priv_treasures_talk', 'ministerial_servant', 1),
	('rule_gems_elder', 'priv_spiritual_gems', 'elder', 0),
	('rule_gems_ms', 'priv_spiritual_gems', 'ministerial_servant', 1),
	('rule_living_elder', 'priv_christian_living', 'elder', 0),
	('rule_living_ms', 'priv_christian_living', 'ministerial_servant', 1),
	('rule_needs_elder', 'priv_congregation_needs', 'elder', 0),
	('rule_cbs_elder', 'priv_cbs_conductor', 'elder', 0),
	('rule_cbs_ms', 'priv_cbs_conductor', 'ministerial_servant', 1),
	('rule_weekend_chair_elder', 'priv_weekend_chairman', 'elder', 0),
	('rule_weekend_chair_ms', 'priv_weekend_chairman', 'ministerial_servant', 1),
	('rule_public_talk_elder', 'priv_public_talk_speaker', 'elder', 0),
	('rule_public_talk_ms', 'priv_public_talk_speaker', 'ministerial_servant', 1),
	('rule_watchtower_elder', 'priv_watchtower_conductor', 'elder', 0);
-- bible_reading, student_assignment, cbs_reader y watchtower_reader no tienen
-- regla por nombramiento: dependen exclusivamente de una concesión directa en
-- user_privileges (aprobación del cuerpo de ancianos publicador por publicador).
