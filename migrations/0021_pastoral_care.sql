-- Informe de 15 minutos por edad/salud (sfg 10:2) — lo marca el admin a mano.
ALTER TABLE users ADD COLUMN is_eligible_for_reduced_report INTEGER NOT NULL DEFAULT 0;

CREATE TABLE shepherding_visits (
	id TEXT PRIMARY KEY,
	publisher_id TEXT NOT NULL REFERENCES users(id),
	date_visited TEXT NOT NULL,
	elders_assigned TEXT NOT NULL,
	scriptures_considered TEXT,
	follow_up_needed INTEGER NOT NULL DEFAULT 0,
	confidential_notes TEXT,
	visible_to_all_elders INTEGER NOT NULL DEFAULT 0,
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX shepherding_visits_publisher_idx ON shepherding_visits(publisher_id);

CREATE TABLE pastoral_flags (
	id TEXT PRIMARY KEY,
	publisher_id TEXT NOT NULL REFERENCES users(id),
	flagged_by_user_id TEXT NOT NULL REFERENCES users(id),
	reason TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	resolved_at INTEGER
);

CREATE INDEX pastoral_flags_publisher_idx ON pastoral_flags(publisher_id, resolved_at);

CREATE TABLE assistance_requests (
	id TEXT PRIMARY KEY,
	publisher_id TEXT NOT NULL REFERENCES users(id),
	type TEXT NOT NULL CHECK (type IN ('MEDICAL_HLC', 'MATERIAL_AID', 'REMOTE_CONNECTION', 'OTHER')),
	request_date TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'UNDER_EVALUATION', 'IN_PROGRESS', 'RESOLVED')),
	assigned_elders TEXT,
	resolution_summary TEXT,
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX assistance_requests_publisher_idx ON assistance_requests(publisher_id, status);

-- Privilegio de acceso pastoral, otorgado automáticamente a todo anciano
-- activo (no a siervos ministeriales — el pastoreo es responsabilidad de
-- ancianos) — mismo mecanismo que los privilegios de reunión.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_pastoral_care', 'pastoral_care_access', 'Acceso al tablero de pastoreo', 'administrative', 1);

INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_pastoral_care_elder', 'priv_pastoral_care', 'elder', 0);
