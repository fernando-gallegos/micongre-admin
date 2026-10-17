-- Plantillas del mensaje para oradores del fin de semana (invitado que llega / local que sale), con palabras clave entre llaves.
CREATE TABLE weekend_message_templates (
  kind TEXT PRIMARY KEY CHECK (kind IN ('incoming', 'outgoing')),
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
