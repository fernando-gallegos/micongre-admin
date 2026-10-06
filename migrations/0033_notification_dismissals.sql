-- Un usuario oculta una notificación puntual desde Mi Panel; queda oculta
-- para siempre para ese usuario, sin afectar a nadie más ni el historial
-- del remitente (no es un campo "leído" en notifications, ver ese schema).
CREATE TABLE notification_dismissals (
	notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id),
	dismissed_at INTEGER NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX notification_dismissals_user_idx ON notification_dismissals(user_id);
