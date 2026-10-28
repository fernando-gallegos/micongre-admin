-- Plantilla de puestos de tareas operativas por tipo de reunión (entre semana / fin de semana).
-- Mientras congregations.operational_template_set = 0 vale la plantilla por omisión (un puesto por cada privilegio
-- operativo), así que no hace falta sembrar filas aquí.
CREATE TABLE operational_template_slots (
	id TEXT PRIMARY KEY NOT NULL,
	meeting_type TEXT NOT NULL CHECK (meeting_type IN ('midweek', 'weekend')),
	privilege_id TEXT NOT NULL REFERENCES privileges(id),
	position TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX op_template_type_idx ON operational_template_slots (meeting_type, sort_order);

ALTER TABLE congregations ADD COLUMN operational_template_set INTEGER NOT NULL DEFAULT 0;
