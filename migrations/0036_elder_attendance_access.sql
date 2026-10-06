-- El privilegio "Registro de asistencia (S-88)" (priv_meeting_attendance,
-- migración 0005) ahora se otorga automáticamente a todo anciano activo — mismo
-- mecanismo que los demás accesos por módulo (migración 0024). El otorgamiento
-- manual a un publicador sigue disponible vía user_privileges.
INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_attendance_elder', 'priv_meeting_attendance', 'elder', 0);
