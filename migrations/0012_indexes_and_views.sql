-- Vista de solo lectura para el resumen mensual de asistencia (informes),
-- agregando entre semana y fin de semana por año/mes.
CREATE VIEW monthly_attendance_summary AS
SELECT
	CAST(strftime('%Y', meeting_date) AS INTEGER) AS period_year,
	CAST(strftime('%m', meeting_date) AS INTEGER) AS period_month,
	meeting_type,
	COUNT(*) AS meetings_recorded,
	SUM(in_person_count) AS total_in_person,
	SUM(zoom_count) AS total_zoom
FROM meeting_attendance
GROUP BY period_year, period_month, meeting_type;
