-- El conductor de La Atalaya debía ser elegible solo vía el nombramiento
-- genérico "elder" (migración 0005). El nombramiento puntual
-- "watchtower_conductor" (el que se usa para precargar el dropdown al crear
-- una reunión — ver api/weekend/route.ts) no estaba conectado a ninguna
-- regla, así que alguien con ese nombramiento pero sin un nombramiento
-- "elder" propio registrado no aparecía como elegible. getEligiblePublishers
-- ya une automáticamente cualquier regla de appointment_privilege_rules, así
-- que basta con agregar la fila — sin cambios de código.
INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_watchtower_conductor_appt', 'priv_watchtower_conductor', 'watchtower_conductor', 0);
