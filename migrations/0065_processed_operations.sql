-- Operaciones ya procesadas, para que la app Android pueda reintentar con seguridad lo que guardó sin internet: cada operación en cola lleva una
-- clave única (cabecera Idempotency-Key); si el servidor la recibe otra vez, responde "ok" sin repetir el efecto (p. ej. completar un territorio).
CREATE TABLE processed_operations (
  op_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX processed_operations_created_idx ON processed_operations (created_at);
