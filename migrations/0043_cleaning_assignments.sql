-- Limpieza del salón: cada reunión (entre semana o fin de semana) se asigna a
-- UN grupo de servicio completo, nunca a publicadores sueltos. meeting_id es
-- polimórfico (midweek_meetings.id o weekend_meetings.id según meeting_type),
-- sin FK real — igual que operational_schedules; la integridad se valida en
-- código de aplicación (lib/cleaning.ts).
--
-- notification_id apunta a la notificación de grupo que se envió desde el
-- botón "Enviar notificación" de la fila (si ya se envió): al cambiar o quitar
-- el grupo se borra esa notificación para que no quede un aviso huérfano en el
-- feed del grupo anterior.
CREATE TABLE cleaning_assignments (
	id TEXT PRIMARY KEY,
	meeting_type TEXT NOT NULL CHECK (meeting_type IN ('midweek', 'weekend')),
	meeting_id TEXT NOT NULL,
	group_id TEXT NOT NULL REFERENCES field_service_groups(id),
	notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
	notified_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX cleaning_meeting_idx ON cleaning_assignments(meeting_type, meeting_id);
CREATE INDEX cleaning_group_idx ON cleaning_assignments(group_id);

-- Acceso al módulo: se otorga a mano (sin regla por nombramiento), igual que
-- los privilegios de notificaciones. Un admin siempre puede.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_cleaning_admin', 'cleaning_admin', 'Administrar limpieza', 'administrative', 1);
