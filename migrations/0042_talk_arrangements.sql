-- URL del fork desplegado de la congregación (su propia instancia de MiCongre),
-- distinta de `jw_url` (el enlace oficial de JW.ORG). Es siempre un origen
-- https://host sin ruta; con él se piden arreglos de discursos entre instancias.
ALTER TABLE speaker_congregations ADD COLUMN fork_url TEXT;
CREATE UNIQUE INDEX speaker_congregations_fork_url_idx ON speaker_congregations(fork_url);

-- Arreglos de discursos con otra congregación para un mes. Una congregación
-- puede tener varios (uno por mes). `direction`: 'outgoing' = nosotros la
-- solicitamos; 'incoming' = ella nos solicitó. `request_id` es el identificador
-- compartido entre las dos instancias (UUID que genera quien solicita) y hace
-- de credencial para responder y para pedir la lista de oradores.
-- Estados: planned (sólo anotado, sin enviar), pending (esperando respuesta; en
-- 'incoming' espera nuestra decisión), accepted, rejected, counter (se propuso
-- otro mes en proposed_year/proposed_month y se espera la decisión del otro lado).
CREATE TABLE talk_arrangements (
	id TEXT PRIMARY KEY,
	congregation_id TEXT NOT NULL REFERENCES speaker_congregations(id) ON DELETE CASCADE,
	direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
	year INTEGER NOT NULL,
	month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
	status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'pending', 'accepted', 'rejected', 'counter')),
	proposed_year INTEGER,
	proposed_month INTEGER CHECK (proposed_month IS NULL OR proposed_month BETWEEN 1 AND 12),
	request_id TEXT,
	speakers_synced_at INTEGER,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX talk_arrangements_month_idx ON talk_arrangements(congregation_id, year, month);
CREATE UNIQUE INDEX talk_arrangements_request_idx ON talk_arrangements(request_id);
