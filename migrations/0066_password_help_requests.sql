-- «¿Olvidaste tu contraseña?» del login: cada solicitud avisa a quien puede generar un enlace nuevo. Esta tabla solo sirve para
-- limitar las solicitudes (por persona y por dirección IP, guardada como hash) y se limpia sola a los 30 días.
CREATE TABLE password_help_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX password_help_requests_user_idx ON password_help_requests (user_id, created_at);
CREATE INDEX password_help_requests_ip_idx ON password_help_requests (ip_hash, created_at);
