CREATE TABLE field_service_groups (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	overseer_user_id TEXT REFERENCES users(id),
	assistant_user_id TEXT REFERENCES users(id),
	active INTEGER NOT NULL DEFAULT 1
);

-- Se agrega aquí (no en 0003) porque field_service_groups no existía todavía.
-- Nullable: un publicador puede no tener grupo asignado (p. ej. recién llegado).
ALTER TABLE users ADD COLUMN field_service_group_id TEXT REFERENCES field_service_groups(id) ON DELETE SET NULL;

CREATE INDEX users_group_idx ON users(field_service_group_id);
