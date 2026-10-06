-- Solicitud de pastoreo hecha por el propio publicador desde Mi Panel — a
-- diferencia de shepherding_visits (que registra una visita ya realizada).
-- Antes de asignar, es visible para el comité de servicio; una vez asignados
-- los 2 ancianos, pasa a ser visible solo para ellos (ver src/lib/queries/panel.ts).
CREATE TABLE shepherding_visit_requests (
	id TEXT PRIMARY KEY,
	publisher_id TEXT NOT NULL REFERENCES users(id),
	requested_date TEXT NOT NULL,
	notes TEXT,
	assigned_elders TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX shepherding_visit_requests_publisher_idx ON shepherding_visit_requests(publisher_id);
