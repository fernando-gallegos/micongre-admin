-- Mensajes que alguien con el privilegio correspondiente envía a
-- publicadores puntuales, a su propio grupo de servicio, o a toda la
-- congregación — se leen en Mi Panel filtrando por quién es el usuario
-- logueado (feed, no bandeja con estado de "leído").
CREATE TABLE notifications (
	id TEXT PRIMARY KEY,
	sender_user_id TEXT NOT NULL REFERENCES users(id),
	scope TEXT NOT NULL CHECK (scope IN ('publisher', 'group', 'congregation')),
	group_id TEXT REFERENCES field_service_groups(id),
	message TEXT NOT NULL,
	-- Acota solo la vista "vigente" de Mi Panel; el módulo de Notificaciones
	-- siempre muestra el historial completo del remitente, vencido o no.
	expires_at TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX notifications_scope_idx ON notifications(scope);
CREATE INDEX notifications_group_idx ON notifications(group_id);
CREATE INDEX notifications_sender_idx ON notifications(sender_user_id);

-- Solo se llena para scope='publisher' — destinatarios puntuales de ese envío.
CREATE TABLE notification_recipients (
	notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id),
	PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX notification_recipients_user_idx ON notification_recipients(user_id);

-- Catálogo semilla: privilegios para enviar notificaciones — quién puede
-- enviar a publicadores puntuales, a su propio grupo de servicio, o a toda
-- la congregación es tres privilegios independientes (no hay regla por
-- nombramiento: se otorgan a mano, igual que field_service_reports).
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_notify_publishers', 'notify_publishers', 'Enviar notificaciones a publicadores', 'administrative', 1),
	('priv_notify_group', 'notify_group', 'Enviar notificaciones a mi grupo de servicio', 'administrative', 1),
	('priv_notify_congregation', 'notify_congregation', 'Enviar notificaciones a toda la congregación', 'administrative', 1);
