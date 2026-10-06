CREATE TABLE service_reports (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	entered_by_user_id TEXT NOT NULL REFERENCES users(id),
	period_year INTEGER NOT NULL,
	period_month INTEGER NOT NULL,
	participated_in_ministry INTEGER NOT NULL DEFAULT 1,
	is_auxiliary_pioneer_this_month INTEGER NOT NULL DEFAULT 0,
	hours REAL,
	bible_studies_count INTEGER DEFAULT 0,
	credit_hours_note TEXT,
	comments TEXT,
	submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
	status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'not_submitted', 'late'))
);

CREATE UNIQUE INDEX report_user_period_idx ON service_reports(user_id, period_year, period_month);
CREATE INDEX report_period_idx ON service_reports(period_year, period_month);
