-- Tarea fija "Oración" en las reuniones de entre semana y fin de semana,
-- sujeta al privilegio "Orar en nombre de la congregación". Sin regla por
-- nombramiento: depende de una concesión directa en user_privileges.
INSERT INTO privileges (id, code, name, category, requires_male, requires_baptized, is_system_defined) VALUES
	('priv_congregation_prayer', 'congregation_prayer', 'Orar en nombre de la congregación', 'meeting', 1, 1, 1);

-- SQLite no soporta ALTER de un CHECK — se reconstruye la tabla agregando
-- 'prayer' a los tipos de sección (mismo patrón que 0025).
CREATE TABLE midweek_assignments_new (
	id TEXT PRIMARY KEY,
	meeting_id TEXT NOT NULL REFERENCES midweek_meetings(id) ON DELETE CASCADE,
	section_type TEXT NOT NULL CHECK (section_type IN (
		'treasures_talk', 'spiritual_gems', 'bible_reading', 'student_assignment',
		'christian_living', 'congregation_needs', 'cbs', 'living_custom', 'prayer'
	)),
	section_title TEXT,
	sequence_order INTEGER NOT NULL,
	room TEXT NOT NULL DEFAULT 'main' CHECK (room IN ('main', 'auxiliary')),
	main_assignee_id TEXT REFERENCES users(id),
	assistant_assignee_id TEXT REFERENCES users(id),
	duration_minutes INTEGER,
	privilege_id TEXT REFERENCES privileges(id),
	description TEXT
);

INSERT INTO midweek_assignments_new
	(id, meeting_id, section_type, section_title, sequence_order, room,
	 main_assignee_id, assistant_assignee_id, duration_minutes, privilege_id, description)
	SELECT id, meeting_id, section_type, section_title, sequence_order, room,
	       main_assignee_id, assistant_assignee_id, duration_minutes, privilege_id, description
	FROM midweek_assignments;

DROP TABLE midweek_assignments;
ALTER TABLE midweek_assignments_new RENAME TO midweek_assignments;

CREATE INDEX midweek_assign_meeting_idx ON midweek_assignments(meeting_id);
CREATE INDEX midweek_assign_main_idx ON midweek_assignments(main_assignee_id);

-- Las reuniones de entre semana que ya existen reciben su fila de oración.
INSERT INTO midweek_assignments (id, meeting_id, section_type, sequence_order, privilege_id)
	SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	       id, 'prayer', 9, 'priv_congregation_prayer'
	FROM midweek_meetings;

ALTER TABLE weekend_meetings ADD COLUMN prayer_user_id TEXT REFERENCES users(id);
