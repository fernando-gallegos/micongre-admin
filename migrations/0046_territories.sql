-- Territorios de predicación: cada territorio tiene su propio mapa (dibujo
-- vectorial GeoJSON: polígonos, líneas, puntos y textos) y se asigna a un
-- encargado que lo marca como completado o lo devuelve. Cada asignación queda
-- como registro (historial) con su estado y la fecha en que se resolvió.
CREATE TABLE territories (
	id TEXT PRIMARY KEY,
	number TEXT NOT NULL,
	-- 'general': mapa con polígonos, líneas, puntos y textos. 'public_preaching'
	-- (predicación pública: carritos, mesas, etc.): solo puntos y textos.
	kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'public_preaching')),
	name TEXT,
	notes TEXT,
	-- GeoJSON FeatureCollection (null = todavía sin dibujar). Los textos son
	-- Point con properties.kind = 'text' y properties.text.
	map_data TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX territories_number_idx ON territories(number);

CREATE TABLE territory_assignments (
	id TEXT PRIMARY KEY,
	territory_id TEXT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
	assignee_user_id TEXT NOT NULL REFERENCES users(id),
	assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
	assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
	status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'returned')),
	resolved_at INTEGER,
	resolution_comment TEXT,
	-- Aviso enviado al encargado desde el botón "Enviar" (si ya se envió): al
	-- cambiar o quitar al encargado se borra para no dejar un aviso huérfano.
	notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
	notified_at INTEGER
);

CREATE INDEX territory_assignments_territory_idx ON territory_assignments(territory_id);
CREATE INDEX territory_assignments_assignee_idx ON territory_assignments(assignee_user_id, status);
-- A lo más una asignación vigente por territorio; las resueltas quedan de historial.
CREATE UNIQUE INDEX territory_assignments_active_idx ON territory_assignments(territory_id) WHERE status = 'assigned';

-- Acceso al módulo: ya existía el privilegio sin uso 'territory_management'
-- (id priv_territory_management). Se renombra y se conecta por nombramiento:
-- superintendente de servicio y siervo de territorios lo reciben solos; a
-- cualquier otro se le puede otorgar a mano. Un admin siempre puede.
UPDATE privileges SET name = 'Siervo de territorios' WHERE id = 'priv_territory_management';

INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_territories_service_overseer', 'priv_territory_management', 'service_overseer', 0),
	('rule_territories_territory_servant', 'priv_territory_management', 'territory_servant', 0);
