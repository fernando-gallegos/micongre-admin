-- Tokens de Firebase Cloud Messaging (push en tiempo real) de la app Android: uno por dispositivo.
CREATE TABLE device_tokens (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token TEXT NOT NULL,
	platform TEXT NOT NULL DEFAULT 'android',
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX device_tokens_token_idx ON device_tokens (token);
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id);
