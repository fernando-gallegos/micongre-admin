-- Horas de proyectos (construcción, etc.) de los precursores regulares: se
-- suman a las horas de servicio para el progreso hacia las 600 del año.
-- NULL = sin horas de proyecto (nunca 0).
ALTER TABLE service_reports ADD COLUMN project_hours REAL;
