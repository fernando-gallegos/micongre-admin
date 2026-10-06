-- SQLite no permite ALTER a un CHECK constraint — se reconstruye la tabla,
-- mismo patrón que 0013_expand_appointment_types.sql.
CREATE TABLE account_activation_tokens_new (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL,
	purpose TEXT NOT NULL CHECK (purpose IN ('initial_setup', 'password_reset', 'circuit_overseer_visit')),
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO account_activation_tokens_new
	SELECT id, user_id, token_hash, purpose, created_by_user_id, expires_at, used_at, created_at
	FROM account_activation_tokens;

DROP TABLE account_activation_tokens;
ALTER TABLE account_activation_tokens_new RENAME TO account_activation_tokens;

CREATE UNIQUE INDEX activation_token_hash_idx ON account_activation_tokens(token_hash);
CREATE INDEX activation_user_idx ON account_activation_tokens(user_id, used_at);

-- Techo que sobrevive a la rotación del refresh token — solo lo usa el acceso
-- de visita del SC, para que ninguna rotación (ventana deslizante normal)
-- pueda extender la sesión más allá de co_visit_schedules.endDate.
ALTER TABLE refresh_tokens ADD COLUMN cap_expires_at INTEGER;

-- Privilegio de acceso de visita del SC — sin fila en appointment_privilege_rules
-- a propósito: un SC no es un nombramiento de esta congregación, solo se
-- otorga por concesión directa (PrivilegesCard, ya existente).
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_co_visit_access', 'co_visit_access', 'Acceso de visita del superintendente de circuito (S-61/S-62)', 'administrative', 1);
