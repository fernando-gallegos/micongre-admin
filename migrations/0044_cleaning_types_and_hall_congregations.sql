-- Limpieza del Salón del Reino según la Guía y el Cronograma oficiales:
-- tres tipos de limpieza (ligera después de cada reunión, profunda cada semana,
-- a fondo por lo menos una vez al año) y un salón que puede compartirse con
-- otras congregaciones. Reemplaza cleaning_assignments (0043, solo limpieza
-- ligera con un único grupo), migrando sus filas.

-- Otras congregaciones que usan el mismo Salón del Reino. Una tarea puede
-- quedar a cargo de una de ellas (o de varias, o junto con la nuestra): en
-- ese caso no hay a quién avisar en nuestra congregación.
CREATE TABLE cleaning_congregations (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Una tarea de limpieza, identificada según su tipo:
--   ligera   → una reunión (meeting_type + meeting_id, polimórfico sin FK real)
--   profunda → una semana (week_start = el lunes, 'YYYY-MM-DD')
--   a_fondo  → una fecha concreta (task_date); puede haber varias al año
-- completed_at/completed_by: el coordinador de limpieza marca el recuadro del
-- cronograma cada vez que se realiza la limpieza.
CREATE TABLE cleaning_tasks (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('ligera', 'profunda', 'a_fondo')),
	meeting_type TEXT CHECK (meeting_type IN ('midweek', 'weekend')),
	meeting_id TEXT,
	week_start TEXT,
	task_date TEXT,
	notes TEXT,
	completed_at INTEGER,
	completed_by_user_id TEXT REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	CHECK (
		(kind = 'ligera' AND meeting_type IS NOT NULL AND meeting_id IS NOT NULL AND week_start IS NULL AND task_date IS NULL)
		OR (kind = 'profunda' AND week_start IS NOT NULL AND meeting_type IS NULL AND meeting_id IS NULL AND task_date IS NULL)
		OR (kind = 'a_fondo' AND task_date IS NOT NULL AND meeting_type IS NULL AND meeting_id IS NULL AND week_start IS NULL)
	)
);

CREATE UNIQUE INDEX cleaning_tasks_meeting_idx ON cleaning_tasks(meeting_type, meeting_id) WHERE kind = 'ligera';
CREATE UNIQUE INDEX cleaning_tasks_week_idx ON cleaning_tasks(week_start) WHERE kind = 'profunda';
CREATE INDEX cleaning_tasks_date_idx ON cleaning_tasks(task_date);

-- Quiénes la realizan: uno de nuestros grupos de servicio, toda nuestra
-- congregación, u otra congregación del salón. notification_id es el aviso que
-- se envió a ese responsable (solo los dos primeros tipos reciben avisos); se
-- borra al quitar al responsable para no dejar avisos huérfanos.
CREATE TABLE cleaning_task_assignees (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
	assignee_type TEXT NOT NULL CHECK (assignee_type IN ('group', 'own_congregation', 'congregation')),
	group_id TEXT REFERENCES field_service_groups(id),
	congregation_id TEXT REFERENCES cleaning_congregations(id),
	notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
	notified_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	CHECK (
		(assignee_type = 'group' AND group_id IS NOT NULL AND congregation_id IS NULL)
		OR (assignee_type = 'own_congregation' AND group_id IS NULL AND congregation_id IS NULL)
		OR (assignee_type = 'congregation' AND congregation_id IS NOT NULL AND group_id IS NULL)
	)
);

CREATE INDEX cleaning_assignees_task_idx ON cleaning_task_assignees(task_id);
CREATE INDEX cleaning_assignees_group_idx ON cleaning_task_assignees(group_id);
CREATE UNIQUE INDEX cleaning_assignees_group_uq ON cleaning_task_assignees(task_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX cleaning_assignees_congregation_uq ON cleaning_task_assignees(task_id, congregation_id) WHERE congregation_id IS NOT NULL;
CREATE UNIQUE INDEX cleaning_assignees_own_uq ON cleaning_task_assignees(task_id) WHERE assignee_type = 'own_congregation';

-- Migra lo asignado con 0043 (limpieza ligera por reunión → un grupo).
INSERT INTO cleaning_tasks (id, kind, meeting_type, meeting_id, created_at)
	SELECT id, 'ligera', meeting_type, meeting_id, created_at FROM cleaning_assignments;
INSERT INTO cleaning_task_assignees (id, task_id, assignee_type, group_id, notification_id, notified_at, created_at)
	SELECT lower(hex(randomblob(16))), id, 'group', group_id, notification_id, notified_at, created_at FROM cleaning_assignments;
DROP TABLE cleaning_assignments;
