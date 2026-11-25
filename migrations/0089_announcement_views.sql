-- Novedades («¿Qué hay de nuevo?»): qué novedad ya vio y cerró cada persona, para mostrarla una sola vez. El contenido está en el
-- código (lib/announcements/catalog.ts).
CREATE TABLE IF NOT EXISTS announcement_views (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	announcement_id TEXT NOT NULL,
	seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY (user_id, announcement_id)
);
