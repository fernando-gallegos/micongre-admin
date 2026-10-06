CREATE TABLE push_subscriptions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	endpoint TEXT NOT NULL,
	p256dh TEXT NOT NULL,
	auth_key TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX push_subscriptions_endpoint_idx ON push_subscriptions(endpoint);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);
