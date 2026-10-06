-- Borra TODOS los datos de la congregación y deja la app como nueva (el
-- middleware la manda a /setup porque ya no existe ningún administrador).
-- Es lo mismo que hace "Congregación → Zona de peligro → Borrar todos los
-- datos", pero para cuando no se puede entrar a la app (p. ej. se perdió la
-- contraseña del administrador).
--
-- Se conservan los catálogos que siembran las migraciones: privileges,
-- appointment_privilege_rules y public_talk_outlines.
--
-- IRREVERSIBLE: exporta antes una copia por si acaso:
--   npx wrangler d1 export DB --remote --output respaldo-antes-de-borrar.sql
--
-- Uso:
--   npx wrangler d1 execute DB --remote --file=./scripts/wipe-all-data.sql
--   npx wrangler d1 execute DB --local  --file=./scripts/wipe-all-data.sql   (para probar primero)
--
-- Si se agrega una tabla nueva de datos, agrégala aquí también (un nombre
-- inexistente hace fallar todo el archivo, así que nunca queda a medias).

PRAGMA defer_foreign_keys = true;

DELETE FROM territory_assignments;
DELETE FROM territories;
DELETE FROM notification_dismissals;
DELETE FROM notification_recipients;
DELETE FROM notifications;
DELETE FROM push_subscriptions;
DELETE FROM shepherding_visit_requests;
DELETE FROM shepherding_visits;
DELETE FROM pastoral_flags;
DELETE FROM assistance_requests;
DELETE FROM co_recommendations;
DELETE FROM co_visit_auxiliary_pioneers;
DELETE FROM co_visit_schedules;
DELETE FROM disaster_assessment_records;
DELETE FROM meeting_attendance;
DELETE FROM operational_schedules;
DELETE FROM outgoing_talks;
DELETE FROM speaker_outlines;
DELETE FROM midweek_assignments;
DELETE FROM midweek_meetings;
DELETE FROM weekend_meetings;
DELETE FROM speakers;
DELETE FROM speaker_congregations;
DELETE FROM service_reports;
DELETE FROM user_privileges;
DELETE FROM theocratic_appointments;
DELETE FROM account_activation_tokens;
DELETE FROM refresh_tokens;
DELETE FROM field_service_groups;
DELETE FROM users;
DELETE FROM households;
DELETE FROM congregations;

INSERT OR IGNORE INTO congregations (id, name) VALUES ('main', 'Mi congregación');
