-- Discursos públicos que oradores locales dan en OTRA congregación (a
-- diferencia de weekend_meetings, que es nuestra propia reunión) — puede
-- haber más de uno en la misma fecha, cada uno con su propia hora porque la
-- reunión de la congregación destino puede no coincidir con la nuestra.
CREATE TABLE outgoing_talks (
	id TEXT PRIMARY KEY,
	meeting_date TEXT NOT NULL,
	meeting_time TEXT NOT NULL,
	congregation_id TEXT NOT NULL REFERENCES speaker_congregations(id),
	speaker_id TEXT NOT NULL REFERENCES speakers(id),
	talk_outline_id TEXT NOT NULL REFERENCES public_talk_outlines(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX outgoing_talks_date_idx ON outgoing_talks(meeting_date);
