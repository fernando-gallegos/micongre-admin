-- Animaciones de bienvenida en Mi Panel (web): archivos Lottie (JSON) que se suben desde Congregación, sin desplegar.
-- El interruptor vive en la congregación (apagado por defecto); los archivos se guardan aquí, por carpeta.
ALTER TABLE congregations ADD COLUMN animations_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE welcome_animations (
	id TEXT PRIMARY KEY,
	-- all | male | female | pioneer_all | pioneer_male | pioneer_female
	folder TEXT NOT NULL,
	name TEXT NOT NULL,
	-- El JSON de Lottie tal cual se subió.
	data TEXT NOT NULL,
	size INTEGER NOT NULL,
	width INTEGER NOT NULL,
	height INTEGER NOT NULL,
	duration_ms INTEGER NOT NULL,
	created_by_user_id TEXT REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX welcome_animations_folder_idx ON welcome_animations(folder);
