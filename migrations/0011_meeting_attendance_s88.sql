-- meeting_id es polimórfico, igual que en operational_schedules.
CREATE TABLE meeting_attendance (
	id TEXT PRIMARY KEY,
	meeting_type TEXT NOT NULL CHECK (meeting_type IN ('midweek', 'weekend')),
	meeting_id TEXT NOT NULL,
	meeting_date TEXT NOT NULL,
	in_person_count INTEGER NOT NULL DEFAULT 0,
	zoom_count INTEGER NOT NULL DEFAULT 0,
	recorded_by_user_id TEXT REFERENCES users(id),
	recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX attendance_meeting_idx ON meeting_attendance(meeting_type, meeting_id);
CREATE INDEX attendance_date_idx ON meeting_attendance(meeting_date);
