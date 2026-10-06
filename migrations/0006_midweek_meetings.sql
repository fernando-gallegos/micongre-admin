CREATE TABLE midweek_meetings (
	id TEXT PRIMARY KEY,
	meeting_date TEXT NOT NULL,
	week_label TEXT,
	status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
		'scheduled', 'cancelled_assembly', 'cancelled_memorial', 'adjusted_co_visit'
	)),
	chairman_user_id TEXT REFERENCES users(id),
	opening_song_number INTEGER,
	study_lesson_reference TEXT,
	has_aux_room INTEGER NOT NULL DEFAULT 0,
	notes TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX midweek_date_idx ON midweek_meetings(meeting_date);

CREATE TABLE midweek_assignments (
	id TEXT PRIMARY KEY,
	meeting_id TEXT NOT NULL REFERENCES midweek_meetings(id) ON DELETE CASCADE,
	section_type TEXT NOT NULL CHECK (section_type IN (
		'treasures_talk', 'spiritual_gems', 'bible_reading',
		'student_assignment', 'christian_living', 'congregation_needs', 'cbs'
	)),
	section_title TEXT,
	sequence_order INTEGER NOT NULL,
	room TEXT NOT NULL DEFAULT 'main' CHECK (room IN ('main', 'auxiliary')),
	main_assignee_id TEXT REFERENCES users(id),
	assistant_assignee_id TEXT REFERENCES users(id),
	duration_minutes INTEGER,
	privilege_id TEXT REFERENCES privileges(id)
);

CREATE INDEX midweek_assign_meeting_idx ON midweek_assignments(meeting_id);
CREATE INDEX midweek_assign_main_idx ON midweek_assignments(main_assignee_id);
