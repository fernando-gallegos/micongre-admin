-- households, users, refresh_tokens, account_activation_tokens.
-- users.field_service_group_id se agrega en la migración 0009, porque
-- field_service_groups todavía no existe en este punto.

CREATE TABLE households (
	id TEXT PRIMARY KEY,
	label TEXT NOT NULL
);

CREATE TABLE users (
	id TEXT PRIMARY KEY,
	full_name TEXT NOT NULL,
	username TEXT,
	email TEXT,
	phone TEXT,
	birth_date TEXT,
	baptism_date TEXT,
	gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
	congregation_status TEXT NOT NULL DEFAULT 'active'
		CHECK (congregation_status IN ('active', 'inactive', 'irregular')),
	theocratic_status TEXT NOT NULL
		CHECK (theocratic_status IN ('student', 'unbaptized_publisher', 'baptized_publisher')),
	emergency_contact_name TEXT,
	emergency_contact_phone TEXT,
	emergency_contact_relation TEXT,
	is_minor INTEGER NOT NULL DEFAULT 0,
	guardian_user_id TEXT REFERENCES users(id),
	household_id TEXT REFERENCES households(id),
	system_role TEXT NOT NULL DEFAULT 'regular' CHECK (system_role IN ('admin', 'regular')),
	account_status TEXT NOT NULL DEFAULT 'no_account'
		CHECK (account_status IN ('no_account', 'invited', 'active', 'disabled')),
	password_hash TEXT,
	password_algo TEXT DEFAULT 'PBKDF2-SHA256',
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX users_username_idx ON users(username);
CREATE INDEX users_status_idx ON users(congregation_status);
CREATE INDEX users_role_idx ON users(system_role);

CREATE TABLE refresh_tokens (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL,
	client_type TEXT NOT NULL DEFAULT 'web' CHECK (client_type IN ('web', 'mobile')),
	issued_at INTEGER NOT NULL DEFAULT (unixepoch()),
	expires_at INTEGER NOT NULL,
	revoked_at INTEGER,
	replaced_by_token_id TEXT,
	user_agent TEXT,
	ip_hash TEXT
);

CREATE UNIQUE INDEX refresh_token_hash_idx ON refresh_tokens(token_hash);
CREATE INDEX refresh_user_idx ON refresh_tokens(user_id, revoked_at);

CREATE TABLE account_activation_tokens (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL,
	purpose TEXT NOT NULL CHECK (purpose IN ('initial_setup', 'password_reset')),
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX activation_token_hash_idx ON account_activation_tokens(token_hash);
CREATE INDEX activation_user_idx ON account_activation_tokens(user_id, used_at);
