-- Predicación, flujo 2 («capitán fijo por día»): capitanes por día de la semana y tipo de territorio, y el capitán de cada salida
-- (al guardarla, su territorio se le asigna a él y se devuelven los que tenía). Los días sin capitán fijo siguen con el flujo 1.
CREATE TABLE IF NOT EXISTS preaching_day_captains (
	weekday INTEGER NOT NULL,
	kind TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (weekday, kind, user_id)
);
ALTER TABLE preaching_sessions ADD COLUMN captain_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
