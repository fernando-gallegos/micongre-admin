-- Módulo Predicación: salidas a predicar con fecha, hora y nota, sobre territorios que ya están asignados.
-- Una salida puede llevar varios territorios (todos del mismo tipo). Si son de tipo General se asigna a toda la
-- congregación o a uno o varios grupos de servicio; si son de predicación pública, a varios publicadores.

-- Acceso: privilegio "Administrar Predicación" (se otorga a mano) y, solo, el superintendente de servicio.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_preaching_admin', 'preaching_admin', 'Administrar Predicación', 'operational', 1);

INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_preaching_service_overseer', 'priv_preaching_admin', 'service_overseer', 0);

CREATE TABLE preaching_sessions (
	id TEXT PRIMARY KEY NOT NULL,
	session_date TEXT NOT NULL,
	session_time TEXT NOT NULL,
	note TEXT,
	-- Tipo de los territorios de la salida: define a quién se puede asignar.
	kind TEXT NOT NULL CHECK (kind IN ('general', 'public_preaching')),
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	-- Avisos generados para esta salida (JSON con los ids): se reemplazan al editarla y se borran al eliminarla.
	notification_ids TEXT,
	notified_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX preaching_sessions_date_idx ON preaching_sessions (session_date);

CREATE TABLE preaching_session_territories (
	session_id TEXT NOT NULL REFERENCES preaching_sessions(id) ON DELETE CASCADE,
	territory_id TEXT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
	PRIMARY KEY (session_id, territory_id)
);
CREATE INDEX preaching_session_territories_territory_idx ON preaching_session_territories (territory_id);

CREATE TABLE preaching_session_targets (
	id TEXT PRIMARY KEY NOT NULL,
	session_id TEXT NOT NULL REFERENCES preaching_sessions(id) ON DELETE CASCADE,
	target_type TEXT NOT NULL CHECK (target_type IN ('congregation', 'group', 'publisher')),
	group_id TEXT REFERENCES field_service_groups(id) ON DELETE CASCADE,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX preaching_session_targets_session_idx ON preaching_session_targets (session_id);
CREATE INDEX preaching_session_targets_user_idx ON preaching_session_targets (user_id);
CREATE INDEX preaching_session_targets_group_idx ON preaching_session_targets (group_id);
