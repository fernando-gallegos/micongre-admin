-- Permisos de acceso por módulo (otorgamiento directo, sin regla de
-- nombramiento automático — igual que priv_co_visit_access): dan acceso a
-- publicadores no-admin a los módulos de Hogares, Informes y Publicadores,
-- ya sea acotado a su propio grupo de servicio o sin acotar.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_households_group', 'households_group', 'Hogares del grupo', 'administrative', 0),
	('priv_households_all', 'households_all', 'Todos los hogares', 'administrative', 0),
	('priv_reports_group', 'reports_group', 'Informes del grupo', 'administrative', 0),
	('priv_reports_all', 'reports_all', 'Todos los informes', 'administrative', 0),
	('priv_publishers_group', 'publishers_group', 'Publicadores del grupo', 'administrative', 0),
	('priv_publishers_all', 'publishers_all', 'Todos los publicadores', 'administrative', 0);
