CREATE TABLE theocratic_appointments (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	appointment_type TEXT NOT NULL CHECK (appointment_type IN (
		'elder', 'ministerial_servant',
		'auxiliary_pioneer', 'regular_pioneer',
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

CREATE INDEX appt_user_idx ON theocratic_appointments(user_id, end_date);
CREATE INDEX appt_type_idx ON theocratic_appointments(appointment_type);
