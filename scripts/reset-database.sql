-- Limpieza completa de la base de datos, exceptuando los usuarios cuyo
-- username se liste en KEEP_USERNAMES más abajo (y todo lo que cuelga de
-- ellos: sus tokens, informes, nombramientos, asignaciones, etc. también se
-- borra — solo sobrevive la fila de `users`).
--
-- Se conservan intactas las tablas de catálogo/seed que el RBAC necesita
-- para funcionar: privileges, appointment_privilege_rules. También se
-- conserva la fila única de `congregations` (nunca se crea otra, ver
-- migrations/0014_congregation_data.sql), pero se limpian sus referencias a
-- usuarios porque esos usuarios pueden desaparecer.
--
-- ADVERTENCIA: esto es irreversible. Hacé un backup antes de correrlo contra
-- la base remota:
--   npx wrangler d1 export DB --remote --output backup-antes-de-reset.sql
--
-- Uso:
--   npx wrangler d1 execute DB --remote --file=./scripts/reset-database.sql
--   npx wrangler d1 execute DB --local  --file=./scripts/reset-database.sql   (para probar primero en local)
--
-- Antes de correrlo, editá la lista de usernames a conservar:
-- ============================================================
-- ============================================================

-- Paso 1: desvincular referencias a usuarios/tablas que están por borrarse,
-- tanto en los usuarios que se conservan como en los que no (da igual, la
-- fila de estos últimos desaparece en el paso 3).
UPDATE users SET guardian_user_id = NULL, household_id = NULL, field_service_group_id = NULL;
UPDATE congregations SET cobe_user_id = NULL, secretary_user_id = NULL, service_overseer_user_id = NULL;

-- Paso 2: vaciar todas las tablas de datos (orden hijo -> padre para no
-- depender de que D1 tenga foreign_keys=ON).
DELETE FROM midweek_assignments;
DELETE FROM midweek_meetings;
DELETE FROM weekend_meetings;
DELETE FROM operational_schedules;
DELETE FROM meeting_attendance;
DELETE FROM disaster_assessment_records;
DELETE FROM field_service_groups;
DELETE FROM co_visit_auxiliary_pioneers;
DELETE FROM co_recommendations;
DELETE FROM co_visit_schedules;
DELETE FROM shepherding_visits;
DELETE FROM pastoral_flags;
DELETE FROM assistance_requests;
DELETE FROM service_reports;
DELETE FROM theocratic_appointments;
DELETE FROM user_privileges;
DELETE FROM account_activation_tokens;
DELETE FROM refresh_tokens;
DELETE FROM households;

-- Paso 3: borrar todos los usuarios excepto los que se listan acá.
DELETE FROM users WHERE username IS NULL OR username NOT IN (
	'usuario1',
	'usuario2'
);
