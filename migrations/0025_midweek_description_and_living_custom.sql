-- SQLite no soporta ALTER de un CHECK — se reconstruye la tabla agregando
-- 'living_custom' (asignación personalizada de Nuestra vida cristiana,
-- variable en cantidad y posición, igual que student_assignment lo es
-- para Seamos mejores maestros).
CREATE TABLE midweek_assignments_new (
	id TEXT PRIMARY KEY,
	meeting_id TEXT NOT NULL REFERENCES midweek_meetings(id) ON DELETE CASCADE,
	section_type TEXT NOT NULL CHECK (section_type IN (
		'treasures_talk', 'spiritual_gems', 'bible_reading', 'student_assignment',
		'christian_living', 'congregation_needs', 'cbs', 'living_custom'
	)),
	section_title TEXT,
	sequence_order INTEGER NOT NULL,
	room TEXT NOT NULL DEFAULT 'main' CHECK (room IN ('main', 'auxiliary')),
	main_assignee_id TEXT REFERENCES users(id),
	assistant_assignee_id TEXT REFERENCES users(id),
	duration_minutes INTEGER,
	privilege_id TEXT REFERENCES privileges(id)
);

INSERT INTO midweek_assignments_new
	SELECT id, meeting_id, section_type, section_title, sequence_order, room,
	       main_assignee_id, assistant_assignee_id, duration_minutes, privilege_id
	FROM midweek_assignments;

DROP TABLE midweek_assignments;
ALTER TABLE midweek_assignments_new RENAME TO midweek_assignments;

CREATE INDEX midweek_assign_meeting_idx ON midweek_assignments(meeting_id);
CREATE INDEX midweek_assign_main_idx ON midweek_assignments(main_assignee_id);

-- Texto instructivo completo de la parte (método, referencia de folleto,
-- preguntas de análisis) — capturado al importar de JW.org.
ALTER TABLE midweek_assignments ADD COLUMN description TEXT;
