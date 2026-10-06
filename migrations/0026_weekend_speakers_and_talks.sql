-- Catálogo de congregaciones externas, usado para el campo "congregación" de
-- un orador visitante (no confundir con la tabla `congregations`, que es la
-- fila única de nuestra propia congregación).
CREATE TABLE speaker_congregations (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	phone TEXT,
	notes TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX speaker_congregations_name_idx ON speaker_congregations(name);

-- Catálogo de bosquejos de discursos públicos (formulario S-99a): número,
-- categoría y título, importable desde el EPUB oficial o agregado a mano.
CREATE TABLE public_talk_outlines (
	id TEXT PRIMARY KEY,
	number INTEGER NOT NULL,
	category TEXT NOT NULL,
	title TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX public_talk_outlines_number_idx ON public_talk_outlines(number);

-- Un orador es local (referencia a un publicador existente, cuyo nombre y
-- teléfono nunca se duplican aquí) o visitante (nombre/teléfono/congregación
-- propios) — igual que el patrón local/visitante ya usado en weekend_meetings
-- antes de esta migración.
CREATE TABLE speakers (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('local', 'visiting')),
	user_id TEXT REFERENCES users(id),
	full_name TEXT,
	phone TEXT,
	congregation_id TEXT REFERENCES speaker_congregations(id),
	notes TEXT,
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	CHECK (
		(kind = 'local' AND user_id IS NOT NULL)
		OR (kind = 'visiting' AND user_id IS NULL AND full_name IS NOT NULL)
	)
);

CREATE UNIQUE INDEX speakers_user_idx ON speakers(user_id);

-- Repertorio de un orador: qué bosquejos tiene registrados a su nombre.
CREATE TABLE speaker_outlines (
	speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
	outline_id TEXT NOT NULL REFERENCES public_talk_outlines(id) ON DELETE CASCADE,
	PRIMARY KEY (speaker_id, outline_id)
);

ALTER TABLE weekend_meetings ADD COLUMN speaker_id TEXT REFERENCES speakers(id);
ALTER TABLE weekend_meetings ADD COLUMN talk_outline_id TEXT REFERENCES public_talk_outlines(id);

-- Migra datos existentes al nuevo modelo antes de soltar las columnas viejas.
INSERT INTO speakers (id, kind, user_id)
SELECT lower(hex(randomblob(16))), 'local', speaker_user_id
FROM (SELECT DISTINCT speaker_user_id FROM weekend_meetings WHERE speaker_user_id IS NOT NULL);

INSERT INTO speaker_congregations (id, name)
SELECT lower(hex(randomblob(16))), visiting_speaker_congregation
FROM (SELECT DISTINCT visiting_speaker_congregation FROM weekend_meetings WHERE visiting_speaker_congregation IS NOT NULL)
WHERE visiting_speaker_congregation NOT IN (SELECT name FROM speaker_congregations);

INSERT INTO speakers (id, kind, full_name, congregation_id)
SELECT
	lower(hex(randomblob(16))),
	'visiting',
	w.visiting_speaker_name,
	(SELECT id FROM speaker_congregations WHERE name = w.visiting_speaker_congregation)
FROM (
	SELECT DISTINCT visiting_speaker_name, visiting_speaker_congregation
	FROM weekend_meetings
	WHERE visiting_speaker_name IS NOT NULL
) w;

UPDATE weekend_meetings
SET speaker_id = (SELECT id FROM speakers WHERE speakers.kind = 'local' AND speakers.user_id = weekend_meetings.speaker_user_id)
WHERE speaker_user_id IS NOT NULL;

UPDATE weekend_meetings
SET speaker_id = (
	SELECT s.id
	FROM speakers s
	LEFT JOIN speaker_congregations c ON c.id = s.congregation_id
	WHERE s.kind = 'visiting'
		AND s.full_name = weekend_meetings.visiting_speaker_name
		AND (c.name = weekend_meetings.visiting_speaker_congregation OR (c.name IS NULL AND weekend_meetings.visiting_speaker_congregation IS NULL))
)
WHERE visiting_speaker_name IS NOT NULL;

INSERT INTO public_talk_outlines (id, number, category, title)
SELECT lower(hex(randomblob(16))), CAST(talk_outline_number AS INTEGER), 'Sin categoría', talk_title
FROM (SELECT DISTINCT talk_outline_number, talk_title FROM weekend_meetings WHERE talk_outline_number IS NOT NULL AND talk_title IS NOT NULL)
WHERE CAST(talk_outline_number AS INTEGER) NOT IN (SELECT number FROM public_talk_outlines);

UPDATE weekend_meetings
SET talk_outline_id = (SELECT id FROM public_talk_outlines WHERE number = CAST(weekend_meetings.talk_outline_number AS INTEGER))
WHERE talk_outline_number IS NOT NULL;

ALTER TABLE weekend_meetings DROP COLUMN speaker_user_id;
ALTER TABLE weekend_meetings DROP COLUMN visiting_speaker_name;
ALTER TABLE weekend_meetings DROP COLUMN visiting_speaker_congregation;
ALTER TABLE weekend_meetings DROP COLUMN talk_outline_number;
ALTER TABLE weekend_meetings DROP COLUMN talk_title;
