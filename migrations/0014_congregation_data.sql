CREATE TABLE congregations (
	id TEXT PRIMARY KEY,
	congregation_number TEXT,
	name TEXT NOT NULL,
	circuit_id TEXT,
	language TEXT,
	kingdom_hall_address TEXT,
	is_contact_congregation INTEGER NOT NULL DEFAULT 0,
	cobe_user_id TEXT REFERENCES users(id),
	secretary_user_id TEXT REFERENCES users(id),
	service_overseer_user_id TEXT REFERENCES users(id),
	meeting_schedules TEXT,
	monthly_contribution_cents INTEGER,
	max_balance_approved_cents INTEGER,
	max_single_payment_limit_cents INTEGER,
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Fila única de configuración institucional — se edita, nunca se crea otra.
INSERT INTO congregations (id, name) VALUES ('main', 'Mi congregación');

-- sfg 3:3 — dirección habitual o enlace de Zoom del grupo de servicio.
ALTER TABLE field_service_groups ADD COLUMN regular_meeting_place TEXT;

-- sfg 10:2 — Tarjeta de Instrucciones Médicas (DPA), preparación para desastres.
ALTER TABLE users ADD COLUMN has_dpa_card INTEGER NOT NULL DEFAULT 0;
