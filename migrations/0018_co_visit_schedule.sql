CREATE TABLE co_visit_schedules (
	id TEXT PRIMARY KEY,
	circuit_overseer_name TEXT NOT NULL,
	start_date TEXT NOT NULL,
	end_date TEXT NOT NULL,
	midweek_meeting_modifications INTEGER NOT NULL DEFAULT 0,
	hospitality_schedule TEXT,
	notes TEXT,
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE co_visit_auxiliary_pioneers (
	id TEXT PRIMARY KEY,
	visit_id TEXT NOT NULL REFERENCES co_visit_schedules(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id)
);

CREATE UNIQUE INDEX co_aux_pioneer_idx ON co_visit_auxiliary_pioneers(visit_id, user_id);

CREATE TABLE co_recommendations (
	id TEXT PRIMARY KEY,
	visit_id TEXT REFERENCES co_visit_schedules(id),
	candidate_user_id TEXT NOT NULL REFERENCES users(id),
	recommended_office TEXT NOT NULL CHECK (recommended_office IN ('ELDER', 'MINISTERIAL_SERVANT')),
	is_first_time INTEGER NOT NULL DEFAULT 0,
	is_reappointment INTEGER NOT NULL DEFAULT 0,
	removal_date TEXT,
	removal_reason TEXT,
	previous_congregation_letter_attached INTEGER NOT NULL DEFAULT 0,
	biblical_qualifications_check TEXT,
	three_mandatory_questions_confirmed INTEGER NOT NULL DEFAULT 0,
	circuit_overseer_decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (circuit_overseer_decision IN ('PENDING', 'APPROVED', 'NOT_APPOINTED')),
	announcement_date TEXT,
	created_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX co_recommendations_visit_idx ON co_recommendations(visit_id);
