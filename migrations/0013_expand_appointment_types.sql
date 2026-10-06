-- Agrega 'special_pioneer' y 'missionary' a appointment_type — los necesita
-- la tarjeta S-21 (checkboxes "Precursor especial" y "Misionero que sirve en
-- el campo"). SQLite no soporta ALTER de un CHECK, así que se reconstruye la
-- tabla completa preservando los datos.

CREATE TABLE theocratic_appointments_new (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	appointment_type TEXT NOT NULL CHECK (appointment_type IN (
		'elder', 'ministerial_servant',
		'auxiliary_pioneer', 'regular_pioneer', 'special_pioneer', 'missionary',
		'cobe', 'secretary', 'service_overseer',
		'watchtower_conductor', 'lm_meeting_overseer', 'auxiliary_counselor',
		'field_service_group_overseer', 'field_service_group_assistant',
		'literature_servant', 'accounts_servant', 'territory_servant',
		'public_talk_coordinator', 'av_coordinator', 'maintenance_coordinator'
	)),
	start_date TEXT NOT NULL,
	end_date TEXT,
	notes TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO theocratic_appointments_new
	SELECT id, user_id, appointment_type, start_date, end_date, notes, created_at
	FROM theocratic_appointments;

DROP TABLE theocratic_appointments;
ALTER TABLE theocratic_appointments_new RENAME TO theocratic_appointments;

CREATE INDEX appt_user_idx ON theocratic_appointments(user_id, end_date);
CREATE INDEX appt_type_idx ON theocratic_appointments(appointment_type);
