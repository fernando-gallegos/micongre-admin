-- Número de la parte tal como aparece en la Guía de actividades (1. … 8.),
-- capturado al importar de JW.ORG; NULL para partes creadas a mano.
ALTER TABLE midweek_assignments ADD COLUMN part_number INTEGER;
