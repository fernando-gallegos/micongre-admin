CREATE TABLE weekend_meetings (
	id TEXT PRIMARY KEY,
	meeting_date TEXT NOT NULL,
	chairman_user_id TEXT REFERENCES users(id),
	speaker_user_id TEXT REFERENCES users(id),
	visiting_speaker_name TEXT,
	visiting_speaker_congregation TEXT,
	talk_outline_number TEXT,
	talk_title TEXT,
	watchtower_conductor_id TEXT REFERENCES users(id),
	watchtower_reader_id TEXT REFERENCES users(id),
	status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
	notes TEXT
);

CREATE UNIQUE INDEX weekend_date_idx ON weekend_meetings(meeting_date);
