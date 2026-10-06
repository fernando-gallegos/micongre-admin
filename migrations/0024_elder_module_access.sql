-- Privilegios de acceso por módulo para el resto del sidebar (Grupos de
-- servicio, Entre semana, Fin de semana, Tareas operativas, Congregación,
-- Contingencia, Visita del SC), otorgados automáticamente a todo anciano
-- activo — mismo mecanismo que priv_pastoral_care (migración 0021). El
-- otorgamiento manual (p. ej. a un siervo ministerial) sigue disponible vía
-- user_privileges sin cambios adicionales, porque getEligiblePublishers /
-- getActivePrivilegeCodes ya unen ambos caminos.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_service_groups_access', 'service_groups_access', 'Grupos de servicio', 'administrative', 1),
	('priv_midweek_access', 'midweek_access', 'Entre semana', 'meeting', 1),
	('priv_weekend_access', 'weekend_access', 'Fin de semana', 'meeting', 1),
	('priv_operational_access', 'operational_access', 'Tareas operativas', 'operational', 1),
	('priv_congregation_access', 'congregation_access', 'Congregación', 'administrative', 1),
	('priv_disaster_access', 'disaster_access', 'Contingencia', 'administrative', 1),
	('priv_co_visit_schedule', 'co_visit_schedule_access', 'Visita del SC', 'administrative', 1);

INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_service_groups_elder', 'priv_service_groups_access', 'elder', 0),
	('rule_midweek_elder', 'priv_midweek_access', 'elder', 0),
	('rule_weekend_elder', 'priv_weekend_access', 'elder', 0),
	('rule_operational_elder', 'priv_operational_access', 'elder', 0),
	('rule_congregation_elder', 'priv_congregation_access', 'elder', 0),
	('rule_disaster_elder', 'priv_disaster_access', 'elder', 0),
	('rule_co_visit_schedule_elder', 'priv_co_visit_schedule', 'elder', 0);
